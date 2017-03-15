<?php
/**
 * WP User Media Upgrades.
 *
 * @package WP User Media\inc
 *
 * @since 1.0.0
 */

// Exit if accessed directly
defined( 'ABSPATH' ) || exit;

/**
 * Get the WP User Media Version saved in DB.
 *
 * @since 1.0.0
 *
 * @return string The WP User Media Raw DB Version.
 */
function wp_user_media_db_version() {
	return get_option( 'wp_user_media_version', 0 );
}

/**
 * Does the plugin needs to be upgraded ?
 *
 * @since 1.0.0
 *
 * @return bool True if it's an upgrade. False otherwise.
 */
function wp_user_media_is_upgrade() {
	return version_compare( wp_user_media_db_version(), wp_user_media_version(), '<' );
}

/**
 * Is this the first install of the plugin ?
 *
 * @since 1.0.0
 *
 * @return bool True if it's the first install. False otherwise.
 */
function wp_user_media_is_install() {
	return 0 === wp_user_media_db_version();
}

/**
 * Run the upgrade routines.
 *
 * @since 1.0.0
 */
function wp_user_media_upgrade() {
	if ( ! wp_user_media_is_upgrade() && ! wp_user_media_is_install() ) {
		return;
	}

	$db_version = wp_user_media_version();

	if ( wp_user_media_is_install() ) {

		// Create the two available terms
		foreach ( array(
			'wp-user-media-file',
			'wp-user-media-directory',
		) as $term ) {
			wp_insert_term( $term, 'user_media_types' );
		}

		/**
		 * Trigger the 'wp_user_media_install' action.
		 *
		 * @since 1.0.0
		 */
		do_action( 'wp_user_media_install' );

	} elseif ( wp_user_media_is_upgrade() ) {
		/**
		 * Trigger the 'wp_user_media_upgrade' action.
		 *
		 * @since 1.0.0
		 */
		do_action( 'wp_user_media_upgrade', $db_version );
	}

	// Update the db version.
	update_option( 'wp_user_media_version', $db_version );
}
add_action( 'admin_init', 'wp_user_media_upgrade', 999 );