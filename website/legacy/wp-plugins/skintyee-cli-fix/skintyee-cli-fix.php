<?php
/**
 * Plugin Name: Skintyee WP-CLI Fix
 * Description: Pre-loads wp-admin/includes/plugin.php so `is_plugin_active()` is
 *              available in CLI / front-end contexts. Workaround for an
 *              Elementor 4.x bug where its init hook calls is_plugin_active()
 *              without including the file that defines it, causing fatal errors
 *              every time WP-CLI loads with Elementor active.
 * Version: 0.1.0
 */

if (!function_exists('is_plugin_active')) {
    require_once ABSPATH . 'wp-admin/includes/plugin.php';
}
