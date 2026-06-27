<?php
/**
 * Shared helpers for building Elementor _elementor_data trees from PHP.
 *
 * Required by build-home-elementor.php and build-section-pages.php.
 * Loaded with require_once so multiple includes are safe.
 */

declare(strict_types=1);

if (!function_exists('skintyee_el_id')) {
    function skintyee_el_id(): string {
        return substr(bin2hex(random_bytes(4)), 0, 7);
    }
    function el_id(): string { return skintyee_el_id(); }
}

if (!function_exists('skintyee_attachment_by_sha')) {
    function skintyee_attachment_by_sha(string $sha): ?array {
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT p.ID, p.guid FROM {$wpdb->posts} p
             JOIN {$wpdb->postmeta} m ON m.post_id = p.ID
             WHERE p.post_type='attachment' AND m.meta_key='_skintyee_sha1' AND m.meta_value=%s LIMIT 1",
            $sha
        ));
        return $row ? ['id' => (int) $row->ID, 'url' => $row->guid] : null;
    }
    function attachment_by_sha(string $sha): ?array { return skintyee_attachment_by_sha($sha); }
}

if (!function_exists('skintyee_widget')) {
    function skintyee_widget(string $type, array $settings, array $elements = []): array {
        return [
            'id' => skintyee_el_id(),
            'elType' => 'widget',
            'widgetType' => $type,
            'settings' => $settings,
            'elements' => $elements,
        ];
    }
    function widget(string $type, array $settings, array $elements = []): array {
        return skintyee_widget($type, $settings, $elements);
    }
}

if (!function_exists('skintyee_column')) {
    function skintyee_column(int $size, array $elements, array $extra = []): array {
        return [
            'id' => skintyee_el_id(),
            'elType' => 'column',
            'settings' => array_merge(['_column_size' => $size, '_inline_size' => $size], $extra),
            'elements' => $elements,
        ];
    }
    function column(int $size, array $elements, array $extra = []): array {
        return skintyee_column($size, $elements, $extra);
    }
}

if (!function_exists('skintyee_section')) {
    function skintyee_section(array $settings, array $columns, bool $inner = false): array {
        $s = [
            'id' => skintyee_el_id(),
            'elType' => 'section',
            'settings' => $settings,
            'elements' => $columns,
        ];
        if ($inner) $s['isInner'] = true;
        return $s;
    }
    function section(array $settings, array $columns, bool $inner = false): array {
        return skintyee_section($settings, $columns, $inner);
    }
}

if (!function_exists('skintyee_heading')) {
    function skintyee_heading(string $title, string $size = 'h2', array $extra = []): array {
        return skintyee_widget('heading', array_merge(['title' => $title, 'header_size' => $size], $extra));
    }
    function heading(string $title, string $size = 'h2', array $extra = []): array {
        return skintyee_heading($title, $size, $extra);
    }
}

if (!function_exists('skintyee_paragraph')) {
    function skintyee_paragraph(string $text, array $extra = []): array {
        return skintyee_widget('text-editor', array_merge(['editor' => '<p>' . $text . '</p>'], $extra));
    }
    function paragraph(string $text, array $extra = []): array {
        return skintyee_paragraph($text, $extra);
    }
}

if (!function_exists('skintyee_image_widget')) {
    function skintyee_image_widget(array $att, array $extra = []): array {
        return skintyee_widget('image', array_merge([
            'image' => ['id' => $att['id'], 'url' => $att['url']],
            'image_size' => 'medium_large',
        ], $extra));
    }
    function image_widget(array $att, array $extra = []): array {
        return skintyee_image_widget($att, $extra);
    }
}

/**
 * Save an _elementor_data tree to a page and switch it to elementor_header_footer
 * template. Wipes prior post_content + clears caches.
 */
if (!function_exists('skintyee_save_elementor_page')) {
    function skintyee_save_elementor_page(int $post_id, array $data): void {
        $json = wp_json_encode($data);
        if ($json === false) {
            fwrite(STDERR, "[elementor] json encode failed for post $post_id\n");
            return;
        }
        $version = defined('ELEMENTOR_VERSION') ? ELEMENTOR_VERSION : '4.0.9';
        wp_update_post(['ID' => $post_id, 'post_content' => '']);
        update_post_meta($post_id, '_elementor_edit_mode', 'builder');
        update_post_meta($post_id, '_elementor_template_type', 'wp-page');
        update_post_meta($post_id, '_elementor_version', $version);
        update_post_meta($post_id, '_elementor_data', wp_slash($json));
        update_post_meta($post_id, '_wp_page_template', 'elementor_header_footer');
        update_post_meta($post_id, 'site-sidebar-layout', 'no-sidebar');
        global $wpdb;
        $wpdb->query("DELETE FROM {$wpdb->postmeta} WHERE post_id = $post_id AND meta_key LIKE 'astra-%'");
    }
}
