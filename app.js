/* app.js – Bear Family Gallery */

window.FamilyApp = (function(){
  // ===== CONFIGURATION =====
  const DRIVE_CONFIG = {
    clientId: '304034846208-q5cumi606scpegkg7rgkbocfuh4fvjbh.apps.googleusercontent.com',
    apiKey: 'AIzaSyDfmBG7mSKkrc8bvz3-rbrJ5IWQx4RmFHY',
    folderId: '1skx93vYn0OE9u-64snbnds8DaOHQGu3G',
    scopes: 'https://www.googleapis.com/auth/drive.readonly'
  };

  const FAMILY = {
    name: 'Bear Family',
    passwordHash: '16b6f231a768a99ff5c35d0f36e8333b8592137316cd10f81ebe4d29e18f3f97'
  };

  let googleAccessToken = null;

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

    // Google Drive Integration
    async initDrive(callback) {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: DRIVE_CONFIG.clientId,
        scope: DRIVE_CONFIG.scopes,
        callback: (response) => {
          if (response.access_token) {
            googleAccessToken = response.access_token;
            console.log('✅ Google Drive connected successfully');
            if (callback) callback();
          } else {
            console.error('❌ Failed to get access token');
          }
        },
      });
      client.requestAccessToken();
    },

    async fetchPhotosFromDrive() {
      if (!googleAccessToken) {
        console.error('❌ Not authenticated with Google Drive');
        return [];
      }

      // Query for image files in the specified folder
      const q = `'${DRIVE_CONFIG.folderId}' in parents and trashed = false and mimeType contains 'image/'`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,createdTime)&pageSize=1000`;

      try {
        console.log('🔍 Fetching photos from Google Drive...');
        const res = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${googleAccessToken}`,
            'Accept': 'application/json'
          }
        });

        if (!res.ok) {
          const errorData = await res.json();
          console.error('❌ Google Drive API error:', errorData);
          return [];
        }

        const data = await res.json();
        console.log(`✅ Found ${data.files?.length || 0} files in folder`);

        if (!data.files || data.files.length === 0) {
          console.warn('⚠️ No photos found. Check:');
          console.warn('  1. Folder ID is correct');
          console.warn('  2. Folder contains images');
          console.warn('  3. You have permission to access the folder');
          return [];
        }

        // Filter for images only and format for display
        const photos = data.files
          .filter(file => file.mimeType && file.mimeType.startsWith('image/'))
          .map(file => ({
            title: file.name,
            url: `https://drive.google.com/thumbnail?id=${file.id}&sz=w1200`,
            id: file.id,
            createdTime: file.createdTime
          }));

        console.log(`✅ Returning ${photos.length} photos`);
        return photos;

      } catch (err) {
        console.error('❌ Fetch request failed:', err);
        return [];
      }
    },

    // Local storage helpers (for admin features)
    local: {
      getAlbums() {
        const stored = localStorage.getItem('family_albums');
        return stored ? JSON.parse(stored) : [];
      },

      addAlbum(album) {
        const albums = this.getAlbums();
        if (albums.find(a => a.id === album.id)) {
          return false; // Album ID already exists
        }
        albums.push(album);
        localStorage.setItem('family_albums', JSON.stringify(albums));
        return true;
      },

      addPhoto(photoData) {
        const albums = this.getAlbums();
        const album = albums.find(a => a.id === photoData.albumId);
        if (!album) return false;

        album.photos = album.photos || [];
        album.photos.push({
          title: photoData.title,
          date: photoData.date,
          viewUrl: photoData.viewUrl,
          downloadUrl: photoData.downloadUrl,
          description: photoData.description || ''
        });

        localStorage.setItem('family_albums', JSON.stringify(albums));
        return true;
      }
    },

    // Google Drive upload helper (for admin)
    drive: {
      async initAuth(statusElementId) {
        const statusEl = document.getElementById(statusElementId);
        
        const client = google.accounts.oauth2.initTokenClient({
          client_id: DRIVE_CONFIG.clientId,
          scope: 'https://www.googleapis.com/auth/drive.file',
          callback: (response) => {
            if (response.access_token) {
              googleAccessToken = response.access_token;
              statusEl.textContent = 'Connected ✅';
              statusEl.style.color = '#25c2a0';
            }
          },
        });
        client.requestAccessToken();
      },

      async uploadFile(file) {
        if (!googleAccessToken) {
          throw new Error('Please connect to Google Drive first');
        }

        const metadata = {
          name: file.name,
          parents: [DRIVE_CONFIG.folderId]
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', file);

        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${googleAccessToken}`
          },
          body: form
        });

        if (!response.ok) {
          throw new Error('Upload failed: ' + response.statusText);
        }

        const result = await response.json();
        return {
          viewUrl: `https://drive.google.com/file/d/${result.id}/view`,
          downloadUrl: `https://drive.google.com/uc?export=download&id=${result.id}`
        };
      }
    },

    // Utility to get album by ID
    getAlbumById(id) {
      const albums = this.local.getAlbums();
      return albums.find(a => a.id === id);
    },

    // Render album page
    renderAlbum(album, titleId, descId, gridId) {
      document.getElementById(titleId).textContent = album.title;
      if (album.description) {
        document.getElementById(descId).textContent = album.description;
      }

      const grid = document.getElementById(gridId);
      grid.innerHTML = '';

      if (!album.photos || album.photos.length === 0) {
        grid.innerHTML = '<p class="muted">No photos in this album yet.</p>';
        return;
      }

      album.photos.forEach(photo => {
        const figure = document.createElement('figure');
        figure.innerHTML = `
          <img src="${photo.viewUrl || photo.downloadUrl}" alt="${photo.title}" loading="lazy">
          <figcaption>
            <strong>${photo.title}</strong>
            ${photo.date ? `<br><span class="muted">${photo.date}</span>` : ''}
            ${photo.description ? `<br><span class="muted">${photo.description}</span>` : ''}
          </figcaption>
        `;
        grid.appendChild(figure);
      });
    }
  };
})();
