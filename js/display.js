/* global wp, _ */

// Make sure the wp object exists.
window.wp = window.wp || {};
window.mediaTheque = window.mediaTheque || _.extend( {}, _.pick( window.wp, 'Backbone', 'template' ) );

( function( $ ) {

	mediaTheque.Models      = mediaTheque.Models || {};
	mediaTheque.Collections = mediaTheque.Collections || {};
	mediaTheque.Views       = mediaTheque.Views || {};

	mediaTheque.Display = {
		init: function() {
			this.views        = new Backbone.Collection();
			this.userMedia    = new wp.api.collections.UserMedia();
			this.queryVars    = new Backbone.Model();

			var View = new mediaTheque.Views.Display( {
				el:           $( '#mediatheque-container' ),
				media:        this.userMedia,
				queryVars:    this.queryVars
			} ).render();
		}
	};

	wp.api.loadPromise.done( function( api ) {
		mediaTheque.Display.init();
	} );

} )( jQuery );
