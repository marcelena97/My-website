/* app.js – Bear Family Gallery - WORKAROUND for 403 on folders query */

window.FamilyApp = (function(){
  // ===== CONFIGURATION =====
  const DRIVE_CONFIG = {
    apiKey: 'AIzaSyDfmBG7mSKkrc8bvz3-rbrJ5IWQx4RmFHY',
    folderId: '1skx93vYn0OE9u-64snbnds8DaOHQGu3G'
  };

  const FAMILY = {
    name: 'Bear Family',
    passwordHash: '16b6f231a768a99ff5c35d0f36e8333b8592137316cd10f81ebe4d29e18f3f97'
  };

  // ===== HELPER FUNCTIONS =====
  function hex(buffer) {
    return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function sha256(str) {
    const enc = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return hex(buf);
  }

  // ===== PUBLIC API =====
  return {
    // Authentication
    async login(password) {
      const hash = await sha256(password);
      if (hash === FAMILY.passwordHash) {
        localStorage.setItem('family_auth', 'true');
        return true;
      }
      return false;
    },

    logout() {
      localStorage.removeItem('family_auth');
    },

    async requireAuth() {
      if (localStorage.getItem('family_auth') !== 'true') {
        window.location.href = 'index.html';
      }
    },

    // ===== WORKAROUND: List all items and filter for folders =====
    async fetchAlbumsFromDrive() {
      // Query for ALL items in the folder (not specifying mimeType)
      const q = `'${DRIVE_CONFIG.folderId}' in parents and trashed = false`;
      const url = `https://www.googleapis.com/drive/v3/files?key=${DRIVE_CONFIG.apiKey}&q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,createdTime)&pageSize=1000`;

      try {
        console.log('🔍 Fetching all items from Google Drive...');
        const res = await fetch(url);

        if (!res.ok) {
          const errorData = await res.json();
          console.error('❌ Google Drive API error:', errorData);
          
          if (res.status === 403) {
            console.error('⚠️ 403 Error - Your folder must be publicly shared!');
            console.error('🔧 FIX: Go to folder settings and set to "Anyone with the link can view"');
          }
          
          return [];
        }

        const data = await res.json();
        console.log(`✅ Found ${data.files?.length || 0} total items`);

        if (!data.files || data.files.length === 0) {
          console.warn('⚠️ No items found in folder');
          return [];
        }

        // Filter for folders only (client-side)
        const folders = data.files.filter(file => 
          file.mimeType === 'application/vnd.google-apps.folder'
        );

        console.log(`📁 Found ${folders.length} folders out of ${data.files.length} total items`);

        if (folders.length === 0) {
          console.warn('⚠️ No subfolders found. Create folders to organize photos into albums.');
          return [];
        }

        // Convert folders to album objects
        const albums = [];
        for (const folder of folders) {
          // Get the first photo from this folder for the thumbnail
          const thumbnail = await this.getFirstPhotoFromFolder(folder.id);
          
          albums.push({
            id: folder.id,
            title: folder.name,
            folderId: folder.id,
            coverUrl: thumbnail,
            createdTime: folder.createdTime
          });
        }

        console.log(`✅ Returning ${albums.length} albums`);
        return albums;

      } catch (err) {
        console.error('❌ Fetch albums failed:', err);
        return [];
      }
    },

    // ===== GET FIRST PHOTO FROM FOLDER (for album thumbnail) =====
    async getFirstPhotoFromFolder(folderId) {
      const q = `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`;
      const url = `https://www.googleapis.com/drive/v3/files?key=${DRIVE_CONFIG.apiKey}&q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`;

      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        
        const data = await res.json();
        if (data.files && data.files.length > 0) {
          return `https://drive.google.com/thumbnail?id=${data.files[0].id}&sz=w400`;
        }
        return null;
      } catch (err) {
        console.error('Error fetching thumbnail:', err);
        return null;
      }
    },

    // ===== FETCH PHOTOS FROM SPECIFIC FOLDER =====
    async fetchPhotosFromFolder(folderId) {
      const q = `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`;
      const url = `https://www.googleapis.com/drive/v3/files?key=${DRIVE_CONFIG.apiKey}&q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,createdTime,imageMediaMetadata)&pageSize=1000&orderBy=createdTime`;

      try {
        console.log(`🔍 Fetching photos from folder: ${folderId}`);
        const res = await fetch(url);

        if (!res.ok) {
          const errorData = await res.json();
          console.error('❌ Google Drive API error:', errorData);
          return [];
        }

        const data = await res.json();
        console.log(`✅ Found ${data.files?.length || 0} photos in folder`);

        if (!data.files || data.files.length === 0) {
          return [];
        }

        // Format photos for display
        const photos = data.files
          .filter(file => file.mimeType && file.mimeType.startsWith('image/'))
          .map(file => ({
            id: file.id,
            title: file.name,
            url: `https://drive.google.com/thumbnail?id=${file.id}&sz=w1200`,
            thumbUrl: `https://drive.google.com/thumbnail?id=${file.id}&sz=w400`,
            downloadUrl: `https://drive.google.com/uc?export=download&id=${file.id}`,
            createdTime: file.createdTime,
            // Extract date from EXIF if available
            date: file.imageMediaMetadata?.time || file.createdTime?.split('T')[0] || ''
          }));

        console.log(`✅ Returning ${photos.length} photos`);
        return photos;

      } catch (err) {
        console.error('❌ Fetch photos failed:', err);
        return [];
      }
    },

    // ===== RENDER ALBUM WITH PHOTOS FROM DRIVE =====
    async renderAlbumFromDrive(folderId, folderName, titleId, descId, gridId) {
      document.getElementById(titleId).textContent = folderName;
      
      const grid = document.getElementById(gridId);
      grid.innerHTML = '<p class="muted" style="grid-column: 1/-1; text-align:center;">Loading photos...</p>';

      const photos = await this.fetchPhotosFromFolder(folderId);

      grid.innerHTML = '';

      if (photos.length === 0) {
        grid.innerHTML = '<p class="muted" style="grid-column: 1/-1; text-align:center;">No photos in this album yet.</p>';
        return;
      }

      photos.forEach(photo => {
        const figure = document.createElement('figure');
        figure.className = 'photo-card';
        figure.innerHTML = `
          <img src="${photo.thumbUrl}" alt="${photo.title}" loading="lazy">
          <figcaption>
            <strong>${photo.title}</strong>
            ${photo.date ? `<br><span class="muted">${photo.date}</span>` : ''}
          </figcaption>
        `;
        
        // Click to view full size
        figure.addEventListener('click', () => {
          this.openPhotoModal(photos, photos.indexOf(photo));
        });
        
        grid.appendChild(figure);
      });
    },

    // ===== PHOTO MODAL / LIGHTBOX =====
    openPhotoModal(photos, currentIndex) {
      // Remove existing modal if any
      const existing = document.querySelector('.photo-modal');
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.className = 'photo-modal';
      
      const renderPhoto = (index) => {
        const photo = photos[index];
        modal.innerHTML = `
          <div class="photo-modal-content">
            <button class="photo-modal-close" onclick="this.closest('.photo-modal').remove()">×</button>
            ${photos.length > 1 && index > 0 ? '<button class="photo-nav photo-nav-prev">‹</button>' : ''}
            ${photos.length > 1 && index < photos.length - 1 ? '<button class="photo-nav photo-nav-next">›</button>' : ''}
            <img src="${photo.url}" alt="${photo.title}">
            <div class="photo-modal-info">
              <strong>${photo.title}</strong>
              ${photo.date ? `<p>${photo.date}</p>` : ''}
              <p class="muted">${index + 1} of ${photos.length}</p>
            </div>
          </div>
        `;

        // Navigation
        const prevBtn = modal.querySelector('.photo-nav-prev');
        const nextBtn = modal.querySelector('.photo-nav-next');
        
        if (prevBtn) {
          prevBtn.onclick = () => renderPhoto(index - 1);
        }
        if (nextBtn) {
          nextBtn.onclick = () => renderPhoto(index + 1);
        }

        // Keyboard navigation
        const keyHandler = (e) => {
          if (e.key === 'Escape') modal.remove();
          if (e.key === 'ArrowLeft' && index > 0) renderPhoto(index - 1);
          if (e.key === 'ArrowRight' && index < photos.length - 1) renderPhoto(index + 1);
        };
        document.removeEventListener('keydown', keyHandler);
        document.addEventListener('keydown', keyHandler);
      };

      renderPhoto(currentIndex);
      
      // Click outside to close
      modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
      };

      document.body.appendChild(modal);
    }
  };
})();
