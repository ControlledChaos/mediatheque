/* global wp, _ */

// Make sure the wp object exists.
window.wp = window.wp || {};

( function( $ ) {

	var wpUserMedia = wpUserMedia || _.extend( {}, _.pick( window.wp, 'Backbone', 'template' ) );
	    wpUserMedia.Models      = wpUserMedia.Models || {};
		wpUserMedia.Collections = wpUserMedia.Collections || {};
		wpUserMedia.Views       = wpUserMedia.Views || {};

	// Create a very generic Model for files
	wpUserMedia.Models.File = Backbone.Model.extend( {
		file: {}
	} );

	wpUserMedia.Uploader = function( options ) {
		var self = this, overrides;

		if ( options.overrides ) {
			overrides = options.overrides;
			delete options.overrides;
		}

		wp.Uploader.call( this, options );

		if ( overrides ) {
			_.each( overrides, function( prop, key ) {
				self.uploader.settings[ key ] = prop;

				if ( key === 'headers' ) {
					delete self.uploader.settings.multipart_params['_wpnonce'];
					_.extend( self.uploader.settings.multipart_params, prop, { action: 'upload_user_media' } );
				}
			} );
		}

		this.filesQueue    = new Backbone.Collection();
		this.filesUploaded = new Backbone.Collection();
		this.filesError    = new Backbone.Collection();

		// Unbind all Plupload events from the WP Uploader.
		this.uploader.unbind( 'FilesAdded, UploadProgress, FileUploaded, Error' );

		/**
		 * User feedback callback.
		 *
		 * @param  {string}        message
		 * @param  {object}        data
		 * @param  {plupload.File} file     File that was uploaded.
		 */
		error = function( message, data, file ) {
			if ( file.userMedia ) {
				file.userMedia.destroy();
			}

			self.filesError.add( {
				feedback: message || pluploadL10n.default_error,
				data    : data,
				file    : file
			} );

			self.error( message, data, file );
		};

		this.uploader.bind( 'FilesAdded', function( uploader, files ) {
			_.each( files, function( file ) {
				var attributes, image;

				// Ignore failed uploads.
				if ( plupload.FAILED === file.status ) {
					return;
				}

				// Generate attributes for a new `Attachment` model.
				attributes = _.extend( {
					id:        file.id,
					file:      file,
					uploading: true,
					date:      new Date(),
					filename:  file.name
				}, _.pick( file, 'loaded', 'size', 'percent' ) );

				// Handle early mime type scanning for images.
				image = /(?:jpe?g|png|gif)$/i.exec( file.name );

				// For images set the model's type and subtype attributes.
				if ( image ) {
					attributes.type = 'image';

					// `jpeg`, `png` and `gif` are valid subtypes.
					// `jpg` is not, so map it to `jpeg`.
					attributes.subtype = ( 'jpg' === image[0] ) ? 'jpeg' : image[0];
				}

				// Create a model for the attachment, and add it to the Upload queue collection
				// so listeners to the upload queue can track and display upload progress.
				file.userMedia = new wpUserMedia.Models.File( attributes );
				self.filesQueue.add( file.userMedia );

				self.added( file.userMedia );
			} );

			uploader.refresh();
			uploader.start();
		} );

		this.uploader.bind( 'UploadProgress', function( uploader, file ) {
			file.userMedia.set( _.pick( file, 'loaded', 'percent' ) );
		} );

		this.uploader.bind( 'FileUploaded', function( uploader, file, response ) {
			var status;

			try {
				status   = response.status;
				response = JSON.parse( response.response );
			} catch ( e ) {
				return error( pluploadL10n.default_error, e, file );
			}

			if ( ! _.isObject( response ) || _.isUndefined( status ) ) {
				return error( pluploadL10n.default_error, null, file );
			} else if ( 201 !== status ) {
				return error( response.data && response.data.message, response.data, file );
			}

			_.each( ['file','loaded','size','percent'], function( key ) {
				file.userMedia.unset( key );
			} );

			file.userMedia.set( _.extend( response, { uploading: false } ) );

			// Add the file to the Uploaded ones
			self.filesUploaded.add( file.userMedia );

			self.success( file.userMedia );
		} );

		/**
		 * Trigger an event to inform a new upload is being processed
		 *
		 * @event BeforeUpload
		 * @param {plupload.Uploader} uploader Uploader instance.
		 * @param {Array}             files    Array of file objects that were added to queue by the user.
		 */
		this.uploader.bind( 'BeforeUpload', function( uploader, files ) {
			$( self ).trigger( 'wp-user-media-new-upload', uploader, files );
		} );

		/**
		 * Reset the filesQueue once the upload is complete
		 *
		 * @event BeforeUpload
		 * @param {plupload.Uploader} uploader Uploader instance.
		 * @param {Array}             files    Array of file objects that were added to queue by the user.
		 */
		this.uploader.bind( 'UploadComplete', function( uploader, files ) {
			$( self ).trigger( 'wp-user-media-upload-complete', uploader, files );
			self.filesQueue.reset();
		} );

		this.uploader.bind( 'Error', function( uploader, pluploadError ) {
			var message = pluploadL10n.default_error,
				key;

			// Check for plupload errors.
			for ( key in wp.Uploader.errorMap ) {
				if ( pluploadError.code === plupload[ key ] ) {
					message = wp.Uploader.errorMap[ key ];

					if ( _.isFunction( message ) ) {
						message = message( pluploadError.file, pluploadError );
					}

					break;
				}
			}

			error( message, pluploadError, pluploadError.file );
			$( self ).trigger( 'wp-user-media-upload-error', uploader, pluploadError );

			uploader.refresh();
		} );
	};

	$.extend( wpUserMedia.Uploader.prototype, {
		init    : function() {},
		success : function() {},
		added   : function() {},
		progress: function() {},
		complete: function() {},
		error   : function() {},

		refresh: function() {
			wp.Uploader.prototype.refresh.apply( this, arguments );
		},

		param: function( key, value ) {
			wp.Uploader.prototype.param.apply( this, arguments );
		}
	} );

	// Extend wp.Backbone.View with .prepare()
	wpUserMedia.View = wpUserMedia.Backbone.View.extend( {
		prepare: function() {
			if ( ! _.isUndefined( this.model ) && _.isFunction( this.model.toJSON ) ) {
				return this.model.toJSON();
			} else {
				return {};
			}
		}
	} );

	wpUserMedia.Views.User = wpUserMedia.View.extend( {
		tagName:    'li',
		className:  'user',
		template: wpUserMedia.template( 'wp-user-media-user' )
	} );

	wpUserMedia.Views.Users = wpUserMedia.View.extend( {
		tagName:   'ul',
		className: 'users',

		events: {
			'click a.user-link' : 'displayUserMedia'
		},

		initialize: function() {
			this.collection.on( 'add', this.addItemView, this );

			this.isRequestingMore = false;

			$( document ).on( 'scroll', _.bind( this.scroll, this ) );
		},

		addItemView: function( user ) {
			this.views.add( new wpUserMedia.Views.User( { model: user } ) );
		},

		displayUserMedia: function( event ) {
			event.preventDefault();

			var user_id = $( event.currentTarget ).data( 'id' );

			_.each( this.collection.models, function( model ) {
				var attributes = { current: false };
				if ( user_id === model.get( 'id' ) ) {
					attributes.current = true;
				}

				model.set( attributes );
			} );
		},

		scroll: function() {
			var listOffset = $( this.el ).offset(), el = document.body,
			    scrollTop = $(document).scrollTop();

			if ( ! this.collection.hasMore() || this.isRequestingMore ) {
				return;
			}

			if ( el.scrollHeight - scrollTop < el.scrollHeight - listOffset.top ) {
				this.isRequestingMore = true;
				this.collection.more( {
					success : _.bind( this.resetRequestingMore, this ),
					error   : _.bind( this.resetRequestingMore, this )
				} );
			}
		},

		resetRequestingMore: function() {
			this.isRequestingMore = false;
		}
	} );

	wpUserMedia.Views.UserMedia = wpUserMedia.View.extend( {
		tagName:    'li',
		className:  'user-media',
		template: wpUserMedia.template( 'wp-user-media-media' ),

		initialize: function() {
			if ( this.model.get( 'uploading' ) ) {
				// Show Upload progress
				this.model.on( 'change:percent', this.progress, this );

				// Replace the uploaded file with the User Media model.
				this.model.on( 'change:guid', this.update, this );

			// The dir background is specific.
			} else if ( 'dir' === this.model.get( 'media_type' ) ) {
				this.el.className += ' dir';

			// Set additionnal urls
			} else {
				this.setMediaUrls();
			}
		},

		setMediaUrls: function() {
			if ( 'image' === this.model.get( 'media_type' ) && this.model.get( 'guid' ) ) {
				var bgUrl = this.model.get( 'guid' ).rendered,
				    mediaDetails = this.model.get( 'media_details' ), fileName;

				if ( _.isObject( mediaDetails.medium ) ) {
					fileName = mediaDetails.file.split( '/' );
					bgUrl = bgUrl.replace( fileName[ oFile.length - 1 ], mediaDetails.medium.file );
				}

				this.model.set( { background: bgUrl }, { silent: true } );
			}

			this.model.set( { download: this.model.get( 'link' ) + wpUserMediaSettings.common.downloadSlug + '/' }, { silent: true } );
		},

		progress: function( file ) {
			if ( ! _.isUndefined( file.get( 'percent' ) ) ) {
				$( '#' + file.get( 'id' ) + ' .wp-user-media-progress .wp-user-media-bar' ).css( 'width', file.get('percent') + '%' );
			}
		},

		update: function( file ) {
			_.each( ['date', 'filename', 'uploading', 'subtype' ], function( attribute ) {
				file.unset( attribute, { silent: true } );
			} );

			this.setMediaUrls();
			this.render();
		}
	} );

	wpUserMedia.Views.UserMedias = wpUserMedia.Views.Users.extend( {
		tagName:   'ul',
		className: 'user-media',

		initialize: function() {
			wpUserMedia.Views.Users.prototype.initialize.apply( this, arguments );

			this.collection.on( 'reset', this.queryMedia, this );

			this.collection.reset();
		},

		queryMedia: function() {
			var query_vars = this.options.query_vars || { user_media_context: 'admin' };

			this.collection.fetch( {
				data : query_vars
			} );
		},

		addItemView: function( user_media ) {
			var position = user_media.get( 'at' );

			if ( _.isUndefined( position ) ) {
				this.views.add( new wpUserMedia.Views.UserMedia( { model: user_media } ) );
			} else {
				this.views.add( new wpUserMedia.Views.UserMedia( { model: user_media } ), { at: position } );
			}
		}
	} );

	wpUserMedia.Views.uploaderProgress = wpUserMedia.View.extend( {
		tagName: 'div',
		className: 'wp-user-media-status',
		template: wpUserMedia.template( 'wp-user-media-progress' ),

		initialize: function() {
			this.model.on( 'change:percent', this.progress, this );
		},

		progress: function( model ) {
			if ( ! _.isUndefined( model.get( 'percent' ) ) ) {
				$( '#' + model.get( 'id' ) + ' .wp-user-media-progress .wp-user-media-bar' ).css( 'width', model.get('percent') + '%' );
			}
		}
	} );

	wpUserMedia.Views.MkDir = wpUserMedia.View.extend( {
		tagName: 'div',
		id: 'directory-form',
		className: 'postbox',
		template: wpUserMedia.template( 'wp-user-media-dirmaker' ),

		events: {
			'click button.close' : 'removeSelf',
			'click #create-dir'  : 'createDir'
		},

		initialize: function() {
			this.model.set( _.pick( wpUserMediaSettings.common, 'closeBtn' ), { silent: true } );
		},

		removeSelf: function( event ) {
			if ( _.isObject( event ) && event.currentTarget ) {
				event.preventDefault();
			}

			wpUserMedia.App.toolbarItems.get( this.options.toolbarItem ).set( { active: false } );
		},

		createDir: function( event ) {
			event.preventDefault();

			var form = $( event.currentTarget ).closest( 'form' ), dirData = {},
			    p = this.options.params || {};

			_.each( $( form ).serializeArray(), function( pair ) {
				pair.name = pair.name.replace( '[]', '' );
				dirData[ pair.name ] = pair.value;
			} );

			// Missing title!
			if ( ! dirData.title ) {
				return;
			}

			_.extend( dirData, p );

			var dir = new wp.api.models.UserMedia( dirData );
			dir.save( {
					action: 'mkdir_user_media'
				},
				{
					success: _.bind( this.mkdirSuccess, this ),
					error: _.bind( this.mkdirError, this )
				}
			);
		},

		mkdirSuccess: function( model ) {
			model.set( { at: 0 }, { silent: true } );
			wpUserMedia.App.userMedia.add( model );
			this.removeSelf();
		},

		mkdirError: function( error ) {
			console.log( error );
		}
	} );

	wpUserMedia.Views.Uploader = wpUserMedia.Views.MkDir.extend( {
		id: wpUserMediaSettings.params.container,
		className: 'wp-user-media-uploader-box',
		template: wpUserMedia.template( 'wp-user-media-uploader' ),

		initialize: function() {
			this.model = new Backbone.Model( wpUserMediaSettings.params );
			this.on( 'ready', this.initUploader );

			wpUserMedia.Views.MkDir.prototype.initialize.apply( this, arguments );
		},

		initUploader: function() {
			var pluploadOptions = _.mapObject( _.pick( this.model.attributes, 'container', 'browser', 'dropzone' ), function( v, k ) {
				return '#' + v;
			} );

			_.extend( pluploadOptions, this.options || {} );
			this.uploader = new wpUserMedia.Uploader( pluploadOptions );

			this.uploader.filesError.on( 'add', this.uploadError, this );
			this.uploader.filesQueue.on( 'add', this.addProgressView, this );
			this.uploader.filesQueue.on( 'reset', this.removeSelf, this );
		},

		uploadError: function( error ) {
			console.log( error );
		},

		addProgressView: function( file ) {
			var o = this.options || {};

			if ( ! _.isObject( o.mediaView ) ) {
				this.views.add( '#wp-user-media-upload-status', new wpUserMedia.Views.uploaderProgress( { model: file } ) );
			} else {
				o.mediaView.collection.add( file.set( { at: 0 }, { silent: true } ) );
			}
		}
	} );

	wpUserMedia.Views.ToolbarItem = wpUserMedia.View.extend( {
		tagName  : 'li',
		template: wpUserMedia.template( 'wp-user-media-toolbar-item' ),

		initialize: function() {
			if ( this.model.get( 'current' ) ) {
				this.el.className = 'current';
			}

			this.model.on( 'change:disable', this.refreshItem, this );
		},

		refreshItem: function( model, changed ) {
			var element = $( this.$el ).find( 'button' ).first();

			element.prop( 'disabled', changed );
		}
	} );

	wpUserMedia.Views.Toolbar = wpUserMedia.View.extend( {
		tagName  : 'ul',
		className: 'filter-links',

		events: {
			'click button' : 'activateView'
		},

		initialize: function() {
			var o = this.options || {}, position = 0, current = false;

			_.each( wpUserMediaSettings.toolbarItems, function( name, id ) {
				position += 1;

				if ( o.users.length && 'users' === id ) {
					current = true;
				} else {
					current = false;
				}

				this.collection.add( {
					id: id,
					name: name,
					position: position,
					current: current,
					disable: 0 !== o.users.length && 'users' !== id,
				} );

				this.addItemBar( this.collection.get( id ) );
			}, this );

			this.collection.on( 'change:current', this.refreshToolbar, this );
		},

		addItemBar: function( toolbarItem ) {
			this.views.add( new wpUserMedia.Views.ToolbarItem( { model: toolbarItem } ) );
		},

		refreshToolbar: function( model, changed ) {
			if ( false === changed || 'false' === changed ) {
				return;
			}

			_.each( this.$el.children(), function( e ) {
				$( e ).removeClass( 'current' );
			} );

			$( this.$el ).find( '[data-id="' + model.get( 'id' ) + '"]' ).parent( 'li' ).addClass( 'current' );
		},

		activateView: function( event ) {
			event.preventDefault();

			var current = $( event.currentTarget ), model, disable = false, subview = null;

			if ( current.prop( 'disabled' ) ) {
				return;
			}

			if ( 'upload' === current.data( 'id' ) || 'directory' === current.data( 'id' ) ) {
				subview = current.data( 'id' );
			} else if ( 'users' === current.data( 'id' ) ) {
				disable = true;
			}

			_.each( this.collection.models, function( model ) {
				var attributes = { disable: disable, current: false, active: false };

				if ( ! _.isNull( subview ) ) {
					if ( model.get( 'id' ) === subview ) {
						attributes.active  = true;
					} else {
						attributes.current = model.get( 'current' );
					}

				} else if ( model.get( 'id' ) === current.data( 'id' ) ) {
					attributes.current = true;

					if ( 'users' === model.get( 'id' ) ) {
						attributes.disable = false;
					}
				}

				model.set( attributes );
			}, this );
		}
	} );

	wpUserMedia.Views.Root = wpUserMedia.View.extend( {

		initialize: function() {
			var o = this.options || {};
			this.query_vars = { user_media_context: 'admin' };

			this.views.add( '#users', new wpUserMedia.Views.Users( { collection: o.users } ) );

			o.users.on( 'reset', this.queryUsers, this );
			o.users.on( 'change:current', this.setToolbar, this );
			o.toolbarItems.on( 'change:active', this.displayForms, this );
			o.toolbarItems.on( 'change:current', this.manageLists, this );

			o.users.reset();
		},

		/**
		 * Admins will be able to list users. Listing a user's files needs to select the user.
		 * Regular users won't be able to do that and their own files will be automatically loaded.
		 */
		queryUsers: function() {
			var o = this.options || {};

			o.users.fetch( {
				data: { 'has_disk_usage' : true },
				success : _.bind( this.displayToolbar, this ),
				error   : _.bind( this.setToolbar, this )
			} );
		},

		/**
		 * Display the Main Toolbar
		 */
		displayToolbar: function() {
			var o = this.options || {};

			if ( ! _.isUndefined( this.views._views['#toolbar'] ) ) {
				return;
			}

			this.views.add( '#toolbar', new wpUserMedia.Views.Toolbar( {
				collection: o.toolbarItems,
				users: o.users
			} ) );
		},

		/**
		 * Adjust the Toolbar according to the current user's capabilities.
		 */
		setToolbar: function( model, changed ) {
			var o = this.options || {};

			if ( ! _.isUndefined( changed ) && false === changed ) {
				return;
			}

			// The User is not an admin.
			if ( _.isUndefined( this.views._views['#toolbar'] ) ) {
				delete wpUserMediaSettings.toolbarItems.users;

				this.displayToolbar();

				// Set the Public view as current one.
				o.toolbarItems.get( 'publish' ).set( { current: true } );

			// The User is an admin and has selected a user.
			} else {
				_.each( o.toolbarItems.models, function( model ) {
					var attributes = { disable: false, current: false };
					if ( 'publish' === model.get( 'id' ) ) {
						attributes.current = true;
					}

					model.set( attributes );
				} );
			}
		},

		displayForms: function( model, active ) {
			var o = this.options || {}, params = { 'post_status': 'publish' },
			    s = null, empty = _.isUndefined( this.views._views['#forms'] ) || 0 === this.views._views['#forms'].length;

			if ( -1 === _.indexOf( ['upload', 'directory'], model.get( 'id' ) ) ) {
				return;
			}

			if ( false === active ) {
				if ( empty ) {
					return;
				} else {
					_.each( this.views._views['#forms'], function( view ) {
						if ( ( 'upload' === model.get( 'id' ) && view.uploader ) || ( 'directory' === model.get( 'id' ) && ! view.uploader ) ) {
							view.remove();
						}
					} );
				}
			} else {
				if ( ! empty ) {
					_.each( this.views._views['#forms'], function( view ) {
						view.remove();
					} );
				}

				s = o.toolbarItems.findWhere( { current: true } );

				if ( _.isObject( s ) ) {
					params.post_status = s.get( 'id' );
				}

				if ( 'upload' === model.get( 'id' ) ) {
					this.views.add( '#forms', new wpUserMedia.Views.Uploader( {
						overrides: o.overrides,
						params: params,
						toolbarItem: 'upload',
						mediaView: _.first( this.views._views['#media'] )
					} ) );
				} else {
					this.views.add( '#forms', new wpUserMedia.Views.MkDir( {
						params: params,
						toolbarItem: 'directory',
						model: new Backbone.Model( wpUserMediaSettings.dirmaker )
					} ) );
				}
			}
		},

		manageLists: function( model, changed ) {
			var o = this.options || {};

			if ( false === changed ) {
				if ( 'users' !== model.get( 'id' ) ) {
					_.first( this.views._views['#media'] ).remove();
				} else {
					_.first( this.views._views['#users'] ).remove();
				}
			} else {
				if ( 'users' === model.get( 'id' ) ) {
					this.views.add( '#users', new wpUserMedia.Views.Users( { collection: o.users } ) );
					o.users.reset();
				} else {
					this.query_vars.post_status = model.get( 'id' );

					// Set the User ID.
					if ( o.users.length ) {
						var author = o.users.findWhere( { current: true } );
						this.query_vars.user_id = author.get( 'id' );
					} else {
						this.query_vars.user_id = 0;
					}

					this.views.add( '#media', new wpUserMedia.Views.UserMedias( {
						collection: o.media,
						query_vars: this.query_vars
					} ) );
				}
			}
		}
	} );

	wpUserMedia.App = {
		init: function( restUrl ) {
			this.views        = new Backbone.Collection();
			this.users        = new wp.api.collections.Users();
			this.userMedia    = new wp.api.collections.UserMedia();
			this.toolbarItems = new Backbone.Collection();

			this.overrides = {
				url: restUrl,
				'file_data_name': 'wp_user_media_upload',
				headers: {
					'X-WP-Nonce' : wpApiSettings.nonce
				}
			};

			var rootView = new wpUserMedia.Views.Root( {
				el:           $( '#wp-user-media-container' ),
				users:        this.users,
				media:        this.userMedia,
				overrides:    this.overrides,
				toolbarItems: this.toolbarItems
			} ).render();
		}
	};

	wp.api.loadPromise.done( function( api ) {
		var restUrl;

		if ( api.get( 'apiRoot' ) && api.get( 'versionString' ) ) {
			restUrl = api.get( 'apiRoot' ) + api.get( 'versionString' ) + 'user-media';
		}

		wpUserMedia.App.init( restUrl );
	} );

} )( jQuery );
