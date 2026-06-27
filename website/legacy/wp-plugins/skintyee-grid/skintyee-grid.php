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
});
