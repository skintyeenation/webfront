<?php
/**
 * Plugin Name: Skintyee Image Sizes
 * Description: Registers a custom WP image size 'skintyee_card' (400x250, hard
 *              cropped) used by the Community / News card grids so every card
 *              image renders at the same aspect ratio and the text below lines
 *              up. Standard WP feature — no custom CSS required.
 *              After installing, run: wp media regenerate --yes
 * Version: 0.1.0
 */

add_action('after_setup_theme', function () {
    // 400x350 hard crop -> taller card image, gives photos more room.
    add_image_size('skintyee_card', 400, 350, true);
});

// Expose the size to the WP media UI so it shows up in the image picker too.
add_filter('image_size_names_choose', function ($sizes) {
    $sizes['skintyee_card'] = 'Skintyee Card (400×350)';
    return $sizes;
});
