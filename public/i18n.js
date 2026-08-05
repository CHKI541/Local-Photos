// ============================================================
// i18n.js — Motor de idiomas de la app.
//
// Se carga ANTES que cualquier otro script (incluso ui-helpers.js),
// porque decide el idioma y la dirección (LTR/RTL) del documento antes
// de que se pinte nada. Expone window.t(), window.tn() (con plural) y
// window.setLanguage() para el resto de los scripts.
// ============================================================

const SUPPORTED_LANGS = ['es', 'en', 'he'];
const RTL_LANGS = ['he'];
const LANG_NAMES = { es: 'Español', en: 'English', he: 'עברית' };
const LOCALE_TAGS = { es: 'es-ES', en: 'en-US', he: 'he-IL' };

const TRANSLATIONS = {
    es: {
        app_name_secondary: 'Fotos',
        lang_menu_label: 'Idioma',

        nav_photos: 'Fotos',
        nav_favorites: 'Favoritos',
        nav_videos: 'Videos',
        nav_albums: 'Álbumes',
        nav_people: 'Personas',
        nav_places: 'Lugares',
        nav_trash: 'Papelera',

        sidebar_storage_title: 'Almacenamiento Local',
        sidebar_storage_calculating: 'Calculando almacenamiento...',
        sidebar_configure_folders: 'Configurar carpetas',
        sidebar_footer: 'App local · sin conexión a servidores externos',

        header_search_placeholder: 'Busca por nombre de archivo, carpeta o persona...',
        header_search_clear: 'Borrar búsqueda',
        header_scanning_pc: 'Escaneando PC...',
        header_scanning_listing: 'Buscando archivos...',
        header_scanning_pct: 'Escaneando ({pct}%)',
        header_analyzing_faces: 'Analizando caras...',
        header_analyzing_faces_progress: 'Analizando caras ({done}/{total})',
        header_settings_title: 'Configuración',
        density_small_title: 'Miniaturas pequeñas',
        density_medium_title: 'Miniaturas medianas',
        density_large_title: 'Miniaturas grandes',
        density_group_label: 'Tamaño de las miniaturas',

        sidebar_open: 'Abrir menú',
        sidebar_close: 'Cerrar menú',

        timeline_indexing_title: 'Indexando fotos de tu PC',
        timeline_calculating: 'Calculando...',
        timeline_folder_prefix: 'Carpeta: {folder}',
        timeline_folder_processing: 'Procesando...',
        timeline_processed_prefix: 'Procesadas: {count}',
        timeline_unchanged_prefix: 'Sin cambios: {count}',
        timeline_loading: 'Cargando tus fotos...',

        memories_title: 'Recuerdos',
        memories_years_ago_one: 'Hace 1 año',
        memories_years_ago_other: 'Hace {count} años',

        empty_timeline_title: 'Aún no hay fotos indexadas',
        empty_timeline_text: 'Ve a Configuración y añade una carpeta de tu PC para empezar.',
        empty_timeline_error_title: 'No se pudieron cargar las fotos',
        empty_generic_error_title: 'Error al cargar',
        empty_generic_title: 'No hay elementos aquí',
        item_count_one: '{count} elemento',
        item_count_other: '{count} elementos',
        photo_count_one: '{count} foto',
        photo_count_other: '{count} fotos',

        empty_favorites_title: 'No tienes favoritos todavía',
        empty_favorites_text: 'Pasa el cursor sobre una foto y toca la estrella para añadirla aquí.',
        empty_videos_title: 'No se encontraron videos',
        empty_search_title: 'Sin resultados',
        empty_search_text: 'Prueba con otro nombre de archivo, carpeta o persona.',
        empty_folder_title: 'Carpeta vacía',
        search_results_title: 'Resultados para "{query}"',

        albums_page_title: 'Álbumes',
        albums_create_button: 'Álbum nuevo',
        albums_folders_section_title: 'Carpetas de tu PC',
        empty_albums_title: 'Aún no tienes álbumes',
        empty_albums_text: 'Creá uno para organizar tus fotos favoritas.',
        empty_albums_error_title: 'Error al cargar álbumes',
        empty_album_detail_title: 'Álbum vacío',
        empty_album_detail_text: 'Seleccioná fotos desde "Fotos" y usá "Añadir a álbum" para agregarlas aquí.',
        empty_album_detail_error_title: 'No se pudo cargar el álbum',
        album_delete_button: 'Eliminar álbum',
        album_delete_confirm_title: '¿Eliminar este álbum?',
        album_delete_confirm_message: 'Las fotos seguirán en tu biblioteca; solo se elimina el álbum como colección.',
        album_delete_confirm_button: 'Eliminar álbum',
        toast_album_renamed: 'Álbum renombrado',
        toast_album_rename_error: 'No se pudo renombrar: {error}',
        toast_album_deleted: 'Álbum eliminado',
        toast_album_delete_error: 'No se pudo eliminar el álbum: {error}',
        toast_albums_load_error: 'No se pudieron cargar los álbumes',
        toast_album_created: 'Álbum creado',
        toast_album_create_error: 'No se pudo crear el álbum: {error}',

        album_picker_title: 'Añadir a álbum',
        album_picker_create_new: 'Crear álbum nuevo',
        album_picker_close: 'Cerrar',
        album_picker_no_albums: 'Todavía no tienes álbumes.',
        album_picker_new_title: 'Nombre del álbum nuevo',
        album_picker_new_placeholder: 'Ej. Vacaciones 2026',
        album_picker_new_confirm: 'Crear',
        toast_added_to_album: 'Añadido al álbum',
        toast_add_to_album_error: 'Error al añadir: {error}',
        toast_album_created_with_photos: 'Álbum creado y fotos añadidas',
        toast_removed_from_album: 'Quitado del álbum',
        toast_remove_from_album_error: 'No se pudo quitar del álbum: {error}',

        people_page_title: 'Personas',
        people_cluster_now: 'Reagrupar ahora',
        people_cluster_now_loading: 'Reagrupando...',
        people_group_faces: 'Combinar personas',
        people_confirm_merge: 'Combinar seleccionadas',
        people_cancel: 'Cancelar',
        people_selected_count_one: '{count} seleccionada',
        people_selected_count_other: '{count} seleccionadas',
        empty_people_title: 'Todavía no hay personas agrupadas',
        empty_people_text: 'El reconocimiento facial se ejecuta en segundo plano mientras tienes esta app abierta (100% en tu navegador, sin subir nada a internet). Vuelve en unos minutos, o usa "Reagrupar ahora" si ya se detectaron caras.',
        empty_people_error_title: 'Error al cargar personas',
        empty_person_detail_title: 'No hay fotos de esta persona',
        unnamed_person: 'Sin nombre',
        toast_cluster_error: 'No se pudo agrupar: {error}',
        toast_cluster_done_one: 'Listo: {count} persona agrupada',
        toast_cluster_done_other: 'Listo: {count} personas agrupadas',
        toast_merge_success: 'Personas agrupadas correctamente',
        toast_merge_error: 'No se pudo agrupar: {error}',
        toast_name_saved: 'Nombre guardado',
        toast_name_save_error: 'No se pudo guardar el nombre: {error}',

        person_name_placeholder: 'Añadir nombre...',
        person_save_button: 'Guardar',

        places_page_title: 'Lugares',
        places_map_unavailable_title: 'El mapa no está disponible sin conexión',
        places_map_unavailable_text: 'La sección Lugares usa un mapa que se descarga de internet. Conectate a la red y volvé a abrir esta sección.',
        toast_places_load_error: 'No se pudieron cargar los lugares: {error}',

        trash_page_title: 'Papelera',
        trash_empty_button: 'Vaciar papelera',
        trash_retention_notice: 'Los elementos de la papelera se eliminan definitivamente después de {days} días.',
        trash_days_left_today: 'Hoy',
        trash_days_left_one: '{count} día',
        trash_days_left_other: '{count} días',
        empty_trash_title: 'La papelera está vacía',
        empty_trash_error_title: 'Error al cargar la papelera',
        trash_empty_confirm_title: '¿Vaciar la papelera?',
        trash_empty_confirm_message: 'Se eliminarán definitivamente todos los elementos de la papelera. Esta acción no se puede deshacer.',
        trash_empty_confirm_button: 'Vaciar papelera',
        toast_trash_emptied: '{count} elemento(s) eliminados definitivamente',
        toast_trash_empty_error: 'Error al vaciar la papelera: {error}',

        settings_page_title: 'Configuración',
        settings_folders_title: 'Directorios locales indexados',
        settings_folders_description: 'Agrega los discos o carpetas que contienen tus fotos y videos. El sistema los buscará automáticamente omitiendo archivos del sistema.',
        settings_folder_placeholder: 'Ej: E:\\Fotos o C:\\Users\\usuario\\Pictures',
        settings_folder_remove: 'Quitar',
        settings_no_folders: 'Todavía no agregaste ninguna carpeta.',
        settings_add_folder_button: 'Añadir Carpeta',
        settings_browse_button: 'Explorar...',
        toast_folder_already_added: 'Esa carpeta ya está en la lista',
        settings_face_recognition_title: 'Reconocimiento facial',
        settings_face_recognition_description: 'Agrupa caras parecidas para armar la sección "Personas". Se procesa 100% en tu navegador; ninguna foto sale de tu PC.',
        settings_threshold_title: 'Sensibilidad de agrupamiento',
        settings_threshold_description: 'Si personas distintas se mezclan en un mismo grupo, muévelo hacia {strict}. Si una misma persona se divide en varios grupos, muévelo hacia {permissive}.',
        settings_threshold_strict_word: 'Estricto',
        settings_threshold_permissive_word: 'Permisivo',
        settings_threshold_strict_label: 'Estricto (0.38)',
        settings_threshold_permissive_label: 'Permisivo (0.52)',
        settings_threshold_current_prefix: 'Precisión actual: {value}',
        settings_threshold_balanced: 'Equilibrado',
        settings_threshold_strict_full: 'Estricto: menos falsos positivos, puede dividir a una misma persona en varios grupos',
        settings_threshold_permissive_full: 'Permisivo: agrupa más, pero puede mezclar personas parecidas',
        settings_trash_title: 'Papelera',
        settings_trash_description: 'Días que se conservan los elementos eliminados antes de borrarse definitivamente.',
        settings_save_button: 'Guardar y Escanear Ahora',
        settings_save_button_loading: 'Guardando...',
        toast_settings_load_error: 'No se pudo cargar la configuración: {error}',
        toast_settings_saved: 'Configuración guardada. Escaneando tus carpetas...',
        toast_settings_save_error: 'No se pudo guardar: {error}',

        selection_count_one: '{count} seleccionada',
        selection_count_other: '{count} seleccionadas',
        selection_cancel_title: 'Cancelar selección',
        selection_favorite_title: 'Favorito',
        selection_add_album_title: 'Añadir a álbum',
        selection_remove_album_title: 'Quitar del álbum',
        selection_change_date_title: 'Cambiar fecha',
        selection_trash_title: 'Mover a la papelera',
        selection_restore_title: 'Restaurar',
        selection_delete_forever_title: 'Eliminar definitivamente',
        lightbox_change_date_title: 'Editar fecha',
        dialog_change_date_title: 'Cambiar fecha',
        dialog_change_date_prompt: 'Selecciona la nueva fecha para los elementos seleccionados:',
        toast_date_updated_one: 'Fecha actualizada correctamente',
        toast_date_updated_other: 'Fecha actualizada para {count} elementos',
        toast_date_update_error: 'No se pudo cambiar la fecha: {error}',

        toast_favorited_one: '{count} elemento añadido a favoritos',
        toast_favorited_other: '{count} elementos añadidos a favoritos',
        toast_favorite_error: 'No se pudo marcar como favorito: {error}',
        toast_download_too_many: 'Selecciona como máximo 300 elementos para descargar juntos',
        toast_download_preparing: 'Preparando descarga...',
        toast_trashed_one: '{count} elemento movido a la papelera',
        toast_trashed_other: '{count} elementos movidos a la papelera',
        toast_undo: 'Deshacer',
        toast_restored: 'Restaurado',
        toast_undo_error: 'No se pudo deshacer: {error}',
        toast_trash_error: 'No se pudo mover a la papelera: {error}',
        toast_restore_success: 'Elementos restaurados',
        toast_restore_error: 'No se pudo restaurar: {error}',
        toast_delete_forever_confirm_title_one: '¿Eliminar {count} elemento para siempre?',
        toast_delete_forever_confirm_title_other: '¿Eliminar {count} elementos para siempre?',
        toast_delete_forever_confirm_message: 'Esta acción no se puede deshacer. Los archivos se borrarán permanentemente de tu PC.',
        toast_delete_forever_confirm_button: 'Eliminar para siempre',
        toast_deleted_forever: 'Eliminado definitivamente',
        toast_delete_error: 'Error al eliminar: {error}',
        dialog_cancel: 'Cancelar',

        storage_indexed_of: '{used} indexados · {free} libres de {total}',
        storage_no_disk_info: '{count} fotos/videos · {size} en tus carpetas locales',

        lightbox_close_title: 'Cerrar (Esc)',
        lightbox_favorite_title: 'Favorito (f)',
        lightbox_slideshow_title: 'Presentación',
        lightbox_add_album_title: 'Añadir a álbum',
        lightbox_download_title: 'Descargar',
        lightbox_trash_title: 'Mover a la papelera (Supr)',
        lightbox_info_title: 'Información (i)',
        lightbox_prev_title: 'Anterior',
        lightbox_next_title: 'Siguiente',
        lightbox_open_system_app: 'Abrir con la app del sistema',
        lightbox_video_not_supported: 'Este navegador no puede reproducir este video.',
        lightbox_date_placeholder: 'Fecha de captura',
        lightbox_camera_video_label: 'Video',
        lightbox_camera_image_label: 'Imagen',
        toast_lightbox_opening_system_app: 'Abriendo con la aplicación del sistema...',
        toast_lightbox_open_error: 'No se pudo abrir: {error}',

        page_title_html: 'Local Photos'
    },

    en: {
        app_name_secondary: 'Photos',
        lang_menu_label: 'Language',

        nav_photos: 'Photos',
        nav_favorites: 'Favorites',
        nav_videos: 'Videos',
        nav_albums: 'Albums',
        nav_people: 'People',
        nav_places: 'Places',
        nav_trash: 'Trash',

        sidebar_storage_title: 'Local Storage',
        sidebar_storage_calculating: 'Calculating storage...',
        sidebar_configure_folders: 'Configure folders',
        sidebar_footer: 'Local app · no connection to external servers',

        header_search_placeholder: 'Search by file name, folder or person...',
        header_search_clear: 'Clear search',
        header_scanning_pc: 'Scanning PC...',
        header_scanning_listing: 'Finding files...',
        header_scanning_pct: 'Scanning ({pct}%)',
        header_analyzing_faces: 'Analyzing faces...',
        header_analyzing_faces_progress: 'Analyzing faces ({done}/{total})',
        header_settings_title: 'Settings',
        density_small_title: 'Small thumbnails',
        density_medium_title: 'Medium thumbnails',
        density_large_title: 'Large thumbnails',
        density_group_label: 'Thumbnail size',

        sidebar_open: 'Open menu',
        sidebar_close: 'Close menu',

        timeline_indexing_title: 'Indexing photos from your PC',
        timeline_calculating: 'Calculating...',
        timeline_folder_prefix: 'Folder: {folder}',
        timeline_folder_processing: 'Processing...',
        timeline_processed_prefix: 'Processed: {count}',
        timeline_unchanged_prefix: 'Unchanged: {count}',
        timeline_loading: 'Loading your photos...',

        memories_title: 'Memories',
        memories_years_ago_one: '1 year ago',
        memories_years_ago_other: '{count} years ago',

        empty_timeline_title: 'No photos indexed yet',
        empty_timeline_text: 'Go to Settings and add a folder from your PC to get started.',
        empty_timeline_error_title: 'Photos could not be loaded',
        empty_generic_error_title: 'Error loading',
        empty_generic_title: 'No items here',
        item_count_one: '{count} item',
        item_count_other: '{count} items',
        photo_count_one: '{count} photo',
        photo_count_other: '{count} photos',

        empty_favorites_title: "You don't have any favorites yet",
        empty_favorites_text: 'Hover over a photo and tap the star to add it here.',
        empty_videos_title: 'No videos found',
        empty_search_title: 'No results',
        empty_search_text: 'Try another file name, folder or person.',
        empty_folder_title: 'Empty folder',
        search_results_title: 'Results for "{query}"',

        albums_page_title: 'Albums',
        albums_create_button: 'New album',
        albums_folders_section_title: 'Folders on your PC',
        empty_albums_title: "You don't have any albums yet",
        empty_albums_text: 'Create one to organize your favorite photos.',
        empty_albums_error_title: 'Error loading albums',
        empty_album_detail_title: 'Empty album',
        empty_album_detail_text: 'Select photos from "Photos" and use "Add to album" to add them here.',
        empty_album_detail_error_title: 'Album could not be loaded',
        album_delete_button: 'Delete album',
        album_delete_confirm_title: 'Delete this album?',
        album_delete_confirm_message: 'Your photos will stay in your library; only the album as a collection is deleted.',
        album_delete_confirm_button: 'Delete album',
        toast_album_renamed: 'Album renamed',
        toast_album_rename_error: 'Could not rename: {error}',
        toast_album_deleted: 'Album deleted',
        toast_album_delete_error: 'Could not delete the album: {error}',
        toast_albums_load_error: 'Could not load albums',
        toast_album_created: 'Album created',
        toast_album_create_error: 'Could not create the album: {error}',

        album_picker_title: 'Add to album',
        album_picker_create_new: 'Create new album',
        album_picker_close: 'Close',
        album_picker_no_albums: "You don't have any albums yet.",
        album_picker_new_title: 'New album name',
        album_picker_new_placeholder: 'E.g. Vacation 2026',
        album_picker_new_confirm: 'Create',
        toast_added_to_album: 'Added to album',
        toast_add_to_album_error: 'Error adding: {error}',
        toast_album_created_with_photos: 'Album created and photos added',
        toast_removed_from_album: 'Removed from album',
        toast_remove_from_album_error: 'Could not remove from album: {error}',

        people_page_title: 'People',
        people_cluster_now: 'Regroup now',
        people_cluster_now_loading: 'Regrouping...',
        people_group_faces: 'Merge people',
        people_confirm_merge: 'Merge selected',
        people_cancel: 'Cancel',
        people_selected_count_one: '{count} selected',
        people_selected_count_other: '{count} selected',
        empty_people_title: 'No people grouped yet',
        empty_people_text: 'Face recognition runs in the background while you have this app open (100% in your browser, nothing is uploaded to the internet). Check back in a few minutes, or use "Regroup now" if faces have already been detected.',
        empty_people_error_title: 'Error loading people',
        empty_person_detail_title: 'No photos of this person',
        unnamed_person: 'Unnamed',
        toast_cluster_error: 'Could not group: {error}',
        toast_cluster_done_one: 'Done: {count} person grouped',
        toast_cluster_done_other: 'Done: {count} people grouped',
        toast_merge_success: 'People merged successfully',
        toast_merge_error: 'Could not merge: {error}',
        toast_name_saved: 'Name saved',
        toast_name_save_error: 'Could not save the name: {error}',

        person_name_placeholder: 'Add name...',
        person_save_button: 'Save',

        places_page_title: 'Places',
        places_map_unavailable_title: 'The map is unavailable offline',
        places_map_unavailable_text: 'The Places section uses a map that downloads from the internet. Connect to a network and reopen this section.',
        toast_places_load_error: 'Could not load places: {error}',

        trash_page_title: 'Trash',
        trash_empty_button: 'Empty trash',
        trash_retention_notice: 'Items in the trash are permanently deleted after {days} days.',
        trash_days_left_today: 'Today',
        trash_days_left_one: '{count} day',
        trash_days_left_other: '{count} days',
        empty_trash_title: 'Trash is empty',
        empty_trash_error_title: 'Error loading trash',
        trash_empty_confirm_title: 'Empty the trash?',
        trash_empty_confirm_message: 'All items in the trash will be permanently deleted. This action cannot be undone.',
        trash_empty_confirm_button: 'Empty trash',
        toast_trash_emptied: '{count} item(s) permanently deleted',
        toast_trash_empty_error: 'Error emptying trash: {error}',

        settings_page_title: 'Settings',
        settings_folders_title: 'Indexed local folders',
        settings_folders_description: 'Add the drives or folders that contain your photos and videos. The system will scan them automatically, skipping system files.',
        settings_folder_placeholder: 'E.g: E:\\Photos or C:\\Users\\username\\Pictures',
        settings_folder_remove: 'Remove',
        settings_no_folders: "You haven't added any folder yet.",
        settings_add_folder_button: 'Add Folder',
        settings_browse_button: 'Browse...',
        toast_folder_already_added: 'That folder is already in the list',
        settings_face_recognition_title: 'Face recognition',
        settings_face_recognition_description: 'Groups similar faces to build the "People" section. Processed 100% in your browser; no photo leaves your PC.',
        settings_threshold_title: 'Grouping sensitivity',
        settings_threshold_description: 'If different people get mixed into the same group, move it toward {strict}. If the same person gets split into several groups, move it toward {permissive}.',
        settings_threshold_strict_word: 'Strict',
        settings_threshold_permissive_word: 'Permissive',
        settings_threshold_strict_label: 'Strict (0.38)',
        settings_threshold_permissive_label: 'Permissive (0.52)',
        settings_threshold_current_prefix: 'Current precision: {value}',
        settings_threshold_balanced: 'Balanced',
        settings_threshold_strict_full: 'Strict: fewer false positives, may split the same person into several groups',
        settings_threshold_permissive_full: 'Permissive: groups more, but may mix similar-looking people',
        settings_trash_title: 'Trash',
        settings_trash_description: 'Days that deleted items are kept before being permanently removed.',
        settings_save_button: 'Save and Scan Now',
        settings_save_button_loading: 'Saving...',
        toast_settings_load_error: 'Could not load settings: {error}',
        toast_settings_saved: 'Settings saved. Scanning your folders...',
        toast_settings_save_error: 'Could not save: {error}',

        selection_count_one: '{count} selected',
        selection_count_other: '{count} selected',
        selection_cancel_title: 'Cancel selection',
        selection_favorite_title: 'Favorite',
        selection_add_album_title: 'Add to album',
        selection_remove_album_title: 'Remove from album',
        selection_change_date_title: 'Change date',
        selection_trash_title: 'Move to trash',
        selection_restore_title: 'Restore',
        selection_delete_forever_title: 'Delete forever',
        lightbox_change_date_title: 'Edit date',
        dialog_change_date_title: 'Change date',
        dialog_change_date_prompt: 'Select the new date for selected items:',
        toast_date_updated_one: 'Date updated successfully',
        toast_date_updated_other: 'Date updated for {count} items',
        toast_date_update_error: 'Failed to change date: {error}',

        toast_favorited_one: '{count} item added to favorites',
        toast_favorited_other: '{count} items added to favorites',
        toast_favorite_error: 'Could not mark as favorite: {error}',
        toast_download_too_many: 'Select 300 items or fewer to download together',
        toast_download_preparing: 'Preparing download...',
        toast_trashed_one: '{count} item moved to trash',
        toast_trashed_other: '{count} items moved to trash',
        toast_undo: 'Undo',
        toast_restored: 'Restored',
        toast_undo_error: 'Could not undo: {error}',
        toast_trash_error: 'Could not move to trash: {error}',
        toast_restore_success: 'Items restored',
        toast_restore_error: 'Could not restore: {error}',
        toast_delete_forever_confirm_title_one: 'Delete {count} item forever?',
        toast_delete_forever_confirm_title_other: 'Delete {count} items forever?',
        toast_delete_forever_confirm_message: 'This action cannot be undone. The files will be permanently deleted from your PC.',
        toast_delete_forever_confirm_button: 'Delete forever',
        toast_deleted_forever: 'Permanently deleted',
        toast_delete_error: 'Error deleting: {error}',
        dialog_cancel: 'Cancel',

        storage_indexed_of: '{used} indexed · {free} free of {total}',
        storage_no_disk_info: '{count} photos/videos · {size} in your local folders',

        lightbox_close_title: 'Close (Esc)',
        lightbox_favorite_title: 'Favorite (f)',
        lightbox_slideshow_title: 'Slideshow',
        lightbox_add_album_title: 'Add to album',
        lightbox_download_title: 'Download',
        lightbox_trash_title: 'Move to trash (Del)',
        lightbox_info_title: 'Info (i)',
        lightbox_prev_title: 'Previous',
        lightbox_next_title: 'Next',
        lightbox_open_system_app: 'Open with system app',
        lightbox_video_not_supported: 'This browser cannot play this video.',
        lightbox_date_placeholder: 'Date taken',
        lightbox_camera_video_label: 'Video',
        lightbox_camera_image_label: 'Image',
        toast_lightbox_opening_system_app: 'Opening with system app...',
        toast_lightbox_open_error: 'Could not open: {error}',

        page_title_html: 'Local Photos'
    },

    he: {
        app_name_secondary: 'תמונות',
        lang_menu_label: 'שפה',

        nav_photos: 'תמונות',
        nav_favorites: 'מועדפים',
        nav_videos: 'סרטונים',
        nav_albums: 'אלבומים',
        nav_people: 'אנשים',
        nav_places: 'מקומות',
        nav_trash: 'אשפה',

        sidebar_storage_title: 'אחסון מקומי',
        sidebar_storage_calculating: 'מחשב שטח אחסון...',
        sidebar_configure_folders: 'הגדרת תיקיות',
        sidebar_footer: 'אפליקציה מקומית · ללא חיבור לשרתים חיצוניים',

        header_search_placeholder: 'חיפוש לפי שם קובץ, תיקייה או אדם...',
        header_search_clear: 'ניקוי חיפוש',
        header_scanning_pc: 'סורק את המחשב...',
        header_scanning_listing: 'מחפש קבצים...',
        header_scanning_pct: 'סורק ({pct}%)',
        header_analyzing_faces: 'מנתח פרצופים...',
        header_analyzing_faces_progress: 'מנתח פרצופים ({done}/{total})',
        header_settings_title: 'הגדרות',
        density_small_title: 'תמונות ממוזערות קטנות',
        density_medium_title: 'תמונות ממוזערות בגודל בינוני',
        density_large_title: 'תמונות ממוזערות גדולות',
        density_group_label: 'גודל התמונות הממוזערות',

        sidebar_open: 'פתיחת התפריט',
        sidebar_close: 'סגירת התפריט',

        timeline_indexing_title: 'מאנדקס תמונות מהמחשב שלך',
        timeline_calculating: 'מחשב...',
        timeline_folder_prefix: 'תיקייה: {folder}',
        timeline_folder_processing: 'מעבד...',
        timeline_processed_prefix: 'עובדו: {count}',
        timeline_unchanged_prefix: 'ללא שינוי: {count}',
        timeline_loading: 'טוען את התמונות שלך...',

        memories_title: 'זכרונות',
        memories_years_ago_one: 'לפני שנה',
        memories_years_ago_other: 'לפני {count} שנים',

        empty_timeline_title: 'עדיין לא נוספו תמונות',
        empty_timeline_text: 'עברו להגדרות והוסיפו תיקייה מהמחשב שלכם כדי להתחיל.',
        empty_timeline_error_title: 'לא ניתן היה לטעון את התמונות',
        empty_generic_error_title: 'שגיאה בטעינה',
        empty_generic_title: 'אין פריטים כאן',
        item_count_one: '{count} פריט',
        item_count_other: '{count} פריטים',
        photo_count_one: '{count} תמונה',
        photo_count_other: '{count} תמונות',

        empty_favorites_title: 'עדיין אין לכם מועדפים',
        empty_favorites_text: 'העבירו את העכבר מעל תמונה ולחצו על הכוכב כדי להוסיף אותה כאן.',
        empty_videos_title: 'לא נמצאו סרטונים',
        empty_search_title: 'אין תוצאות',
        empty_search_text: 'נסו שם קובץ, תיקייה או אדם אחר.',
        empty_folder_title: 'תיקייה ריקה',
        search_results_title: 'תוצאות עבור "{query}"',

        albums_page_title: 'אלבומים',
        albums_create_button: 'אלבום חדש',
        albums_folders_section_title: 'תיקיות מהמחשב שלך',
        empty_albums_title: 'עדיין אין לכם אלבומים',
        empty_albums_text: 'צרו אלבום כדי לארגן את התמונות האהובות עליכם.',
        empty_albums_error_title: 'שגיאה בטעינת האלבומים',
        empty_album_detail_title: 'האלבום ריק',
        empty_album_detail_text: 'בחרו תמונות מתוך "תמונות" והשתמשו ב"הוספה לאלבום" כדי להוסיף אותן כאן.',
        empty_album_detail_error_title: 'לא ניתן היה לטעון את האלבום',
        album_delete_button: 'מחיקת אלבום',
        album_delete_confirm_title: 'למחוק את האלבום הזה?',
        album_delete_confirm_message: 'התמונות יישארו בספרייה שלכם; רק האלבום כאוסף יימחק.',
        album_delete_confirm_button: 'מחיקת אלבום',
        toast_album_renamed: 'שם האלבום שונה',
        toast_album_rename_error: 'לא ניתן היה לשנות שם: {error}',
        toast_album_deleted: 'האלבום נמחק',
        toast_album_delete_error: 'לא ניתן היה למחוק את האלבום: {error}',
        toast_albums_load_error: 'לא ניתן היה לטעון את האלבומים',
        toast_album_created: 'האלבום נוצר',
        toast_album_create_error: 'לא ניתן היה ליצור את האלבום: {error}',

        album_picker_title: 'הוספה לאלבום',
        album_picker_create_new: 'יצירת אלבום חדש',
        album_picker_close: 'סגירה',
        album_picker_no_albums: 'עדיין אין לכם אלבומים.',
        album_picker_new_title: 'שם האלבום החדש',
        album_picker_new_placeholder: 'למשל: חופשה 2026',
        album_picker_new_confirm: 'יצירה',
        toast_added_to_album: 'נוסף לאלבום',
        toast_add_to_album_error: 'שגיאה בהוספה: {error}',
        toast_album_created_with_photos: 'האלבום נוצר והתמונות נוספו',
        toast_removed_from_album: 'הוסר מהאלבום',
        toast_remove_from_album_error: 'לא ניתן היה להסיר מהאלבום: {error}',

        people_page_title: 'אנשים',
        people_cluster_now: 'קבץ מחדש עכשיו',
        people_cluster_now_loading: 'מקבץ מחדש...',
        people_group_faces: 'מיזוג אנשים',
        people_confirm_merge: 'מיזוג הנבחרים',
        people_cancel: 'ביטול',
        people_selected_count_one: '{count} נבחר',
        people_selected_count_other: '{count} נבחרו',
        empty_people_title: 'עדיין לא קובצו אנשים',
        empty_people_text: 'זיהוי הפנים פועל ברקע כל עוד האפליקציה פתוחה (100% בדפדפן שלכם, שום דבר לא מועלה לאינטרנט). חזרו בעוד כמה דקות, או השתמשו ב"קבץ מחדש עכשיו" אם כבר זוהו פרצופים.',
        empty_people_error_title: 'שגיאה בטעינת האנשים',
        empty_person_detail_title: 'אין תמונות של האדם הזה',
        unnamed_person: 'ללא שם',
        toast_cluster_error: 'לא ניתן היה לקבץ: {error}',
        toast_cluster_done_one: 'בוצע: {count} אדם קובץ',
        toast_cluster_done_other: 'בוצע: {count} אנשים קובצו',
        toast_merge_success: 'האנשים מוזגו בהצלחה',
        toast_merge_error: 'לא ניתן היה למזג: {error}',
        toast_name_saved: 'השם נשמר',
        toast_name_save_error: 'לא ניתן היה לשמור את השם: {error}',

        person_name_placeholder: 'הוספת שם...',
        person_save_button: 'שמירה',

        places_page_title: 'מקומות',
        places_map_unavailable_title: 'המפה אינה זמינה במצב לא מקוון',
        places_map_unavailable_text: 'מדור המקומות משתמש במפה שמורדת מהאינטרנט. התחברו לרשת ופתחו מחדש את המדור הזה.',
        toast_places_load_error: 'לא ניתן היה לטעון את המקומות: {error}',

        trash_page_title: 'אשפה',
        trash_empty_button: 'רוקן אשפה',
        trash_retention_notice: 'פריטים באשפה נמחקים לצמיתות לאחר {days} ימים.',
        trash_days_left_today: 'היום',
        trash_days_left_one: '{count} יום',
        trash_days_left_other: '{count} ימים',
        empty_trash_title: 'האשפה ריקה',
        empty_trash_error_title: 'שגיאה בטעינת האשפה',
        trash_empty_confirm_title: 'לרוקן את האשפה?',
        trash_empty_confirm_message: 'כל הפריטים באשפה יימחקו לצמיתות. לא ניתן לבטל פעולה זו.',
        trash_empty_confirm_button: 'רוקן אשפה',
        toast_trash_emptied: '{count} פריטים נמחקו לצמיתות',
        toast_trash_empty_error: 'שגיאה בריקון האשפה: {error}',

        settings_page_title: 'הגדרות',
        settings_folders_title: 'תיקיות מקומיות מאונדקסות',
        settings_folders_description: 'הוסיפו את הכוננים או התיקיות שמכילים את התמונות והסרטונים שלכם. המערכת תסרוק אותם אוטומטית ותדלג על קובצי מערכת.',
        settings_folder_placeholder: 'למשל: E:\\Photos או C:\\Users\\username\\Pictures',
        settings_folder_remove: 'הסרה',
        settings_no_folders: 'עדיין לא הוספתם אף תיקייה.',
        settings_add_folder_button: 'הוספת תיקייה',
        settings_browse_button: 'עיון...',
        toast_folder_already_added: 'התיקייה הזו כבר ברשימה',
        settings_face_recognition_title: 'זיהוי פנים',
        settings_face_recognition_description: 'מקבץ פרצופים דומים כדי לבנות את מדור "אנשים". מעובד 100% בדפדפן שלכם; שום תמונה לא יוצאת מהמחשב שלכם.',
        settings_threshold_title: 'רגישות הקיבוץ',
        settings_threshold_description: 'אם אנשים שונים מתערבבים לאותה קבוצה, הזיזו לכיוון {strict}. אם אותו אדם מתפצל למספר קבוצות, הזיזו לכיוון {permissive}.',
        settings_threshold_strict_word: 'קפדני',
        settings_threshold_permissive_word: 'סובלני',
        settings_threshold_strict_label: 'קפדני (0.38)',
        settings_threshold_permissive_label: 'סובלני (0.52)',
        settings_threshold_current_prefix: 'דיוק נוכחי: {value}',
        settings_threshold_balanced: 'מאוזן',
        settings_threshold_strict_full: 'קפדני: פחות זיהויים שגויים, אך עלול לפצל את אותו אדם למספר קבוצות',
        settings_threshold_permissive_full: 'סובלני: מקבץ יותר, אך עלול לערבב בין אנשים דומים',
        settings_trash_title: 'אשפה',
        settings_trash_description: 'מספר הימים שפריטים שנמחקו נשמרים לפני מחיקה סופית.',
        settings_save_button: 'שמירה וסריקה עכשיו',
        settings_save_button_loading: 'שומר...',
        toast_settings_load_error: 'לא ניתן היה לטעון את ההגדרות: {error}',
        toast_settings_saved: 'ההגדרות נשמרו. סורק את התיקיות שלכם...',
        toast_settings_save_error: 'לא ניתן היה לשמור: {error}',

        selection_count_one: '{count} נבחר',
        selection_count_other: '{count} נבחרו',
        selection_cancel_title: 'ביטול הבחירה',
        selection_favorite_title: 'מועדף',
        selection_add_album_title: 'הוספה לאלבום',
        selection_remove_album_title: 'הסרה מהאלבום',
        selection_change_date_title: 'שינוי תאריך',
        selection_trash_title: 'העברה לאשפה',
        selection_restore_title: 'שחזור',
        selection_delete_forever_title: 'מחיקה לצמיתות',
        lightbox_change_date_title: 'עריכת תאריך',
        dialog_change_date_title: 'שינוי תאריך',
        dialog_change_date_prompt: 'בחר תאריך חדש עבור הפריטים הנבחרים:',
        toast_date_updated_one: 'התאריך עודכן בהצלחה',
        toast_date_updated_other: 'התאריך עודכן עבור {count} פריטים',
        toast_date_update_error: 'שגיאה בשינוי התאריך: {error}',

        toast_favorited_one: '{count} פריט נוסף למועדפים',
        toast_favorited_other: '{count} פריטים נוספו למועדפים',
        toast_favorite_error: 'לא ניתן היה לסמן כמועדף: {error}',
        toast_download_too_many: 'בחרו עד 300 פריטים להורדה יחד',
        toast_download_preparing: 'מכין הורדה...',
        toast_trashed_one: '{count} פריט הועבר לאשפה',
        toast_trashed_other: '{count} פריטים הועברו לאשפה',
        toast_undo: 'ביטול',
        toast_restored: 'שוחזר',
        toast_undo_error: 'לא ניתן היה לבטל: {error}',
        toast_trash_error: 'לא ניתן היה להעביר לאשפה: {error}',
        toast_restore_success: 'הפריטים שוחזרו',
        toast_restore_error: 'לא ניתן היה לשחזר: {error}',
        toast_delete_forever_confirm_title_one: 'למחוק {count} פריט לצמיתות?',
        toast_delete_forever_confirm_title_other: 'למחוק {count} פריטים לצמיתות?',
        toast_delete_forever_confirm_message: 'לא ניתן לבטל פעולה זו. הקבצים יימחקו לצמיתות מהמחשב שלכם.',
        toast_delete_forever_confirm_button: 'מחיקה לצמיתות',
        toast_deleted_forever: 'נמחק לצמיתות',
        toast_delete_error: 'שגיאה במחיקה: {error}',
        dialog_cancel: 'ביטול',

        storage_indexed_of: '{used} מאונדקסים · {free} פנויים מתוך {total}',
        storage_no_disk_info: '{count} תמונות/סרטונים · {size} בתיקיות המקומיות שלכם',

        lightbox_close_title: 'סגירה (Esc)',
        lightbox_favorite_title: 'מועדף (f)',
        lightbox_slideshow_title: 'מצגת',
        lightbox_add_album_title: 'הוספה לאלבום',
        lightbox_download_title: 'הורדה',
        lightbox_trash_title: 'העברה לאשפה (Del)',
        lightbox_info_title: 'מידע (i)',
        lightbox_prev_title: 'הקודם',
        lightbox_next_title: 'הבא',
        lightbox_open_system_app: 'פתיחה באפליקציית המערכת',
        lightbox_video_not_supported: 'הדפדפן הזה לא יכול להפעיל את הסרטון הזה.',
        lightbox_date_placeholder: 'תאריך הצילום',
        lightbox_camera_video_label: 'סרטון',
        lightbox_camera_image_label: 'תמונה',
        toast_lightbox_opening_system_app: 'פותח באפליקציית המערכת...',
        toast_lightbox_open_error: 'לא ניתן היה לפתוח: {error}',

        page_title_html: 'Local Photos'
    }
};

function detectDefaultLanguage() {
    try {
        const saved = localStorage.getItem('appLanguage');
        if (saved && SUPPORTED_LANGS.includes(saved)) return saved;
    } catch (e) { /* localStorage no disponible: seguimos con la detección del sistema */ }

    const sysLangs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || 'es'];
    for (const l of sysLangs) {
        const base = String(l).slice(0, 2).toLowerCase();
        if (SUPPORTED_LANGS.includes(base)) return base;
    }
    return 'es';
}

let currentLang = detectDefaultLanguage();

function t(key, vars) {
    const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.es;
    let str = dict[key];
    if (str === undefined) str = (TRANSLATIONS.es[key] !== undefined) ? TRANSLATIONS.es[key] : key;
    if (vars) {
        Object.keys(vars).forEach(k => {
            str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k]);
        });
    }
    return str;
}

// Traducción con plural: usa la clave "{baseKey}_one" cuando count === 1, y
// "{baseKey}_other" en cualquier otro caso (incluido 0). Cubre correctamente
// singular/plural en español, inglés y hebreo para todos los textos con conteo.
function tn(baseKey, count, vars) {
    const suffix = count === 1 ? '_one' : '_other';
    return t(baseKey + suffix, Object.assign({ count }, vars || {}));
}

function isRTL(lang) {
    return RTL_LANGS.includes(lang || currentLang);
}

function localeTag(lang) {
    return LOCALE_TAGS[lang || currentLang] || 'es-ES';
}

function applyLanguageToDocument() {
    document.documentElement.lang = currentLang;
    document.documentElement.dir = isRTL(currentLang) ? 'rtl' : 'ltr';
    document.title = t('page_title_html');
}

function translateStaticDOM(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = t(el.getAttribute('data-i18n-title'));
    });
    scope.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
        el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
    });
}

function setLanguage(lang) {
    if (!SUPPORTED_LANGS.includes(lang) || lang === currentLang) return;
    try { localStorage.setItem('appLanguage', lang); } catch (e) { /* no crítico */ }
    // Recargar es la forma más simple de garantizar que TODO el contenido ya
    // renderizado (grillas, toasts, fechas con locale, etc.) quede consistente
    // en el idioma nuevo, sin tener que re-traducir cada pieza dinámica a mano.
    window.location.reload();
}

// document.documentElement (la etiqueta <html>) ya existe apenas el parser la
// abre, mucho antes de que el resto del <body> se haya parseado. Por eso este
// script se carga como lo PRIMERO en <head>: así lang/dir/title quedan
// correctos antes de que el navegador empiece a pintar algo, evitando que una
// página en hebreo aparezca un instante en modo LTR y luego "salte" a RTL.
applyLanguageToDocument();

// En cambio, traducir los textos ([data-i18n]) sí necesita esperar a que el
// resto del HTML del <body> ya esté parseado.
document.addEventListener('DOMContentLoaded', () => translateStaticDOM());

window.t = t;
window.tn = tn;
window.setLanguage = setLanguage;
window.getCurrentLanguage = () => currentLang;
window.isRTL = isRTL;
window.localeTag = localeTag;
window.translateStaticDOM = translateStaticDOM;
window.SUPPORTED_LANGS = SUPPORTED_LANGS;
window.LANG_NAMES = LANG_NAMES;
