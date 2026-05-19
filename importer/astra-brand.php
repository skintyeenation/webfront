<?php
/**
 * Astra theme customization for the Skin Tyee site.
 *
 * Sets brand colors, typography, header layout, and container widths so the
 * imported content reads like a designed site instead of vanilla Astra.
 * Run via:  wp eval-file /importer/astra-brand.php
 *
 * Brand notes:
 *   - The source site uses a pale mint-teal body background (~#d8e8e1) with
 *     black text and a deep teal/blue primary accent.
 *   - Heading font is set to a serif (community/heritage feel); body is sans.
 *   - Typography is loaded via Google Fonts (Astra handles the @import).
 */

declare(strict_types=1);

$brand = [
    'primary'    => '#2c5f5d',  // deep teal — calm, community-leaning
    'primary_dk' => '#1f4341',  // hover/active state
    'accent'     => '#c0392b',  // warm red, echoes the source's BC-map highlight
    'bg'         => '#e2efe8',  // pale mint, matches the source body background
    'text'       => '#1f2937',  // near-black, plenty of contrast on bg
    'heading'    => '#1f4341',  // headings in the dark teal
];

$mods = [
    // --- Color palette (Astra global colors) -----------------------------
    'global-color-palette' => [
        'palette' => [
            $brand['primary'],
            $brand['primary_dk'],
            $brand['text'],
            $brand['heading'],
            '#4B4F58',
            '#F5F5F5',
            '#FFFFFF',
            '#D1D5DB',
            $brand['accent'],
        ],
    ],

    // --- Body & background ------------------------------------------------
    'theme-color'        => $brand['primary'],
    'link-color'         => $brand['primary'],
    'link-h-color'       => $brand['primary_dk'],
    'text-color'         => $brand['text'],
    'background-color'   => $brand['bg'],
    'site-accent-fg-color' => '#ffffff',

    'body-bg-obj-responsive' => [
        'desktop' => ['background-color' => $brand['bg'], 'background-image' => '', 'background-repeat' => 'repeat', 'background-position' => 'center center', 'background-size' => 'auto', 'background-attachment' => 'scroll'],
        'tablet'  => ['background-color' => $brand['bg'], 'background-image' => '', 'background-repeat' => 'repeat', 'background-position' => 'center center', 'background-size' => 'auto', 'background-attachment' => 'scroll'],
        'mobile'  => ['background-color' => $brand['bg'], 'background-image' => '', 'background-repeat' => 'repeat', 'background-position' => 'center center', 'background-size' => 'auto', 'background-attachment' => 'scroll'],
    ],

    // --- Typography -------------------------------------------------------
    'body-font-family'      => "'Source Sans 3', sans-serif",
    'body-font-variant'     => '400',
    'body-font-weight'      => '400',

    'headings-font-family'  => "'Lora', serif",
    'headings-font-weight'  => '600',
    'headings-color'        => $brand['heading'],

    'font-size-body' => ['desktop' => 17, 'tablet' => 16, 'mobile' => 16,
                        'desktop-unit' => 'px', 'tablet-unit' => 'px', 'mobile-unit' => 'px'],

    'font-size-site-title' => ['desktop' => 28, 'tablet' => 24, 'mobile' => 22,
                              'desktop-unit' => 'px', 'tablet-unit' => 'px', 'mobile-unit' => 'px'],

    'font-size-h1' => ['desktop' => 44, 'tablet' => 36, 'mobile' => 30,
                       'desktop-unit' => 'px', 'tablet-unit' => 'px', 'mobile-unit' => 'px'],

    'font-size-h2' => ['desktop' => 34, 'tablet' => 28, 'mobile' => 24,
                       'desktop-unit' => 'px', 'tablet-unit' => 'px', 'mobile-unit' => 'px'],

    // --- Header & container layout ---------------------------------------
    'header-main-layout-width' => 'content',
    'site-content-width'       => 1200,

    'header-main-rt-section'   => 'menu',
    'site-title-color'         => $brand['heading'],
    'site-title-hover-color'   => $brand['primary'],

    // Slightly softer top header padding to feel more designed
    'site-header-section-spacing-responsive' => [
        'desktop' => ['top' => '20', 'right' => '0', 'bottom' => '20', 'left' => '0'],
        'tablet'  => ['top' => '16', 'right' => '0', 'bottom' => '16', 'left' => '0'],
        'mobile'  => ['top' => '14', 'right' => '0', 'bottom' => '14', 'left' => '0'],
    ],

    // --- Buttons (link buttons + form submits) ---------------------------
    'button-bg-color'      => $brand['primary'],
    'button-bg-h-color'    => $brand['primary_dk'],
    'button-color'         => '#ffffff',
    'button-h-color'       => '#ffffff',
    'button-radius-fields' => ['desktop' => ['top' => 6, 'right' => 6, 'bottom' => 6, 'left' => 6, 'unit' => 'px']],

    // --- Footer ----------------------------------------------------------
    'footer-bg-obj-responsive' => [
        'desktop' => ['background-color' => $brand['heading'], 'background-image' => '', 'background-repeat' => 'repeat', 'background-position' => 'center center', 'background-size' => 'auto', 'background-attachment' => 'scroll'],
        'tablet'  => ['background-color' => $brand['heading'], 'background-image' => '', 'background-repeat' => 'repeat', 'background-position' => 'center center', 'background-size' => 'auto', 'background-attachment' => 'scroll'],
        'mobile'  => ['background-color' => $brand['heading'], 'background-image' => '', 'background-repeat' => 'repeat', 'background-position' => 'center center', 'background-size' => 'auto', 'background-attachment' => 'scroll'],
    ],
    'footer-color' => '#e2efe8',
    'footer-link-color' => '#ffffff',
    'footer-link-h-color' => $brand['bg'],
];

foreach ($mods as $key => $value) {
    set_theme_mod($key, $value);
}

echo "[astra-brand] applied " . count($mods) . " theme mods\n";
echo "[astra-brand] primary: {$brand['primary']}, bg: {$brand['bg']}, heading font: Lora, body font: Source Sans 3\n";
