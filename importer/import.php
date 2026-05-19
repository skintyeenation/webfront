<?php
/**
 * WP-CLI driven importer for the skintyee migration.
 *
 * Reads /scraped/manifest.json (mounted into the wpcli container), uploads every
 * media file via `wp media import`, creates a WP page for every scraped page,
 * and rewrites {{MEDIA:sha1.ext}} placeholders in the content to the actual
 * uploaded attachment URLs.
 *
 * Idempotent on slug: re-running updates existing posts and skips already-imported
 * media (matched by the sha1 stored in attachment meta `_skintyee_sha1`).
 */

declare(strict_types=1);

const MANIFEST_PATH = '/scraped/manifest.json';
const MEDIA_DIR     = '/scraped/media';
const META_KEY      = '_skintyee_sha1';

function wp_cli(array $args): array {
    $cmd = 'wp --allow-root ' . implode(' ', array_map('escapeshellarg', $args));
    exec($cmd . ' 2>&1', $out, $code);
    return [$code, implode("\n", $out)];
}

function wp_cli_json(array $args) {
    [$code, $out] = wp_cli(array_merge($args, ['--format=json']));
    if ($code !== 0) {
        fwrite(STDERR, "wp-cli failed: $out\n");
        exit(1);
    }
    return json_decode($out, true);
}

function find_attachment_by_sha1(string $sha1): ?array {
    $rows = wp_cli_json([
        'post', 'list',
        '--post_type=attachment',
        '--meta_key=' . META_KEY,
        '--meta_value=' . $sha1,
        '--fields=ID,guid',
        '--posts_per_page=1',
    ]);
    return $rows[0] ?? null;
}

function find_post_by_slug(string $slug, int $parent_id = 0): ?array {
    $rows = wp_cli_json([
        'post', 'list',
        '--post_type=page',
        '--name=' . $slug,
        '--post_parent=' . $parent_id,
        '--fields=ID',
        '--posts_per_page=1',
    ]);
    return $rows[0] ?? null;
}

function import_media(array $entry): string {
    $sha1 = $entry['sha1'];
    $ext  = $entry['ext'];
    $path = MEDIA_DIR . "/$sha1$ext";

    $existing = find_attachment_by_sha1($sha1);
    if ($existing) {
        return $existing['guid'];
    }
    if (!file_exists($path)) {
        fwrite(STDERR, "  [media-missing] $path\n");
        return '';
    }

    [$code, $out] = wp_cli([
        'media', 'import', $path,
        '--title=' . $sha1,
        '--porcelain',
    ]);
    if ($code !== 0) {
        fwrite(STDERR, "  [media-import-fail] $path: $out\n");
        return '';
    }
    $attachment_id = (int) trim($out);
    wp_cli(['post', 'meta', 'update', (string) $attachment_id, META_KEY, $sha1]);

    [, $guid] = wp_cli(['post', 'get', (string) $attachment_id, '--field=guid']);
    return trim($guid);
}

/**
 * @return array{0:int,1:int} [post_id, parent_id]
 */
function upsert_page(array $page, array $media_url_map, array $slug_to_id): array {
    $content = $page['html'];
    // Replace {{MEDIA:sha1.ext}} placeholders with uploaded URLs.
    $content = preg_replace_callback('/\{\{MEDIA:([a-f0-9]+)(\.[a-z0-9]+)\}\}/i',
        function ($m) use ($media_url_map) {
            $key = $m[1] . $m[2];
            return $media_url_map[$key] ?? $m[0];
        },
        $content
    );

    $parent_id = 0;
    if (!empty($page['parent_slug']) && isset($slug_to_id[$page['parent_slug']])) {
        $parent_id = $slug_to_id[$page['parent_slug']];
    }
    // Disambiguate by parent: WP allows duplicate slugs across different parents,
    // and the source site uses the same leaf slug under multiple sections (e.g.
    // /youth/how-to-pick-... vs /official-band-general-meeting-minutes/how-to-pick-...).
    $existing = find_post_by_slug($page['slug'], $parent_id);
    $args = [
        'post', $existing ? 'update' : 'create',
    ];
    if ($existing) {
        $args[] = (string) $existing['ID'];
    }
    $args[] = '--post_type=page';
    $args[] = '--post_status=publish';
    $args[] = '--post_title=' . $page['title'];
    $args[] = '--post_name=' . $page['slug'];
    if ($parent_id > 0) {
        $args[] = '--post_parent=' . $parent_id;
    }
    // Pipe content via stdin so we don't blow up the argv length.
    $tmp = tempnam(sys_get_temp_dir(), 'sk_');
    file_put_contents($tmp, $content);
    $cmd = 'wp --allow-root ' . implode(' ', array_map('escapeshellarg', $args))
        . ' --post_content="$(cat ' . escapeshellarg($tmp) . ')" --porcelain';
    exec($cmd . ' 2>&1', $out, $code);
    unlink($tmp);
    if ($code !== 0) {
        fwrite(STDERR, "  [post-fail] {$page['slug']}: " . implode("\n", $out) . "\n");
        return [0, $parent_id];
    }
    $id = $existing ? (int) $existing['ID'] : (int) trim(end($out));
    return [$id, $parent_id];
}

// ---------------------------------------------------------------------------

if (!file_exists(MANIFEST_PATH)) {
    fwrite(STDERR, "manifest not found at " . MANIFEST_PATH . " — run the scraper first.\n");
    exit(1);
}

$manifest = json_decode(file_get_contents(MANIFEST_PATH), true);
$pages = $manifest['pages']   ?? [];
$media = $manifest['media']   ?? [];

echo "[import] " . count($media) . " media files, " . count($pages) . " pages\n";

// Phase 1: media -> build sha1.ext => attachment URL map.
$media_url_map = [];
foreach ($media as $entry) {
    $key = $entry['sha1'] . $entry['ext'];
    $url = import_media($entry);
    if ($url) {
        $media_url_map[$key] = $url;
        echo "  [media] $key -> $url\n";
    }
}

// Phase 2: pages in two passes so parents exist before children.
usort($pages, fn($a, $b) => (int) !empty($a['parent_slug']) <=> (int) !empty($b['parent_slug']));

// $slug_to_id maps top-level slugs to WP IDs so child pages can resolve their parents.
// We deliberately do NOT overwrite when a child page shares its slug with a top-level
// page (e.g. there's a top-level "how-to-pick-..." nested under /youth and /official-band-...).
$slug_to_id = [];
$imported = 0;
foreach ($pages as $page) {
    [$id, $parent_id] = upsert_page($page, $media_url_map, $slug_to_id);
    if (!$id) {
        continue;
    }
    $imported++;
    if (empty($page['parent_slug']) && !isset($slug_to_id[$page['slug']])) {
        $slug_to_id[$page['slug']] = $id;
    }
    $parent_note = $parent_id ? " (parent #$parent_id)" : "";
    echo "  [page] {$page['slug']} -> #$id$parent_note\n";
}

echo "[done] $imported pages imported.\n";
