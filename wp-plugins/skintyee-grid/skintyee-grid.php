<?php
/**
 * Plugin Name: Skintyee Grid Shim
 * Description: Minimal Bootstrap-style grid CSS so the imported Site123 layout
 *              classes (.row, .col-xs-*, .col-sm-*, .col-md-*, .col-lg-*,
 *              .container, .container-fluid) actually render multi-column.
 *              Loaded as a must-use plugin so it survives theme switches.
 * Version: 0.1.0
 */

add_action('wp_enqueue_scripts', function () {
    wp_enqueue_style(
        'skintyee-grid',
        plugins_url('skintyee-grid.css', __FILE__),
        [],
        '0.1.0'
    );
    wp_enqueue_style(
        'skintyee-brand',
        plugins_url('skintyee-brand.css', __FILE__),
        ['skintyee-grid'],
        '0.1.0'
    );
    // Google Fonts: Lora (headings, serif) + Source Sans 3 (body, sans)
    wp_enqueue_style(
        'skintyee-fonts',
        'https://fonts.googleapis.com/css2?family=Lora:wght@500;600;700&family=Source+Sans+3:wght@400;600&display=swap',
        [],
        '0.1.0'
    );
}, 100);  // priority 100 so we load after Astra's inline CSS and can override
