/* app.js — Live Sync opgelost */

window.FamilyApp = (function(){
  const DRIVE_CONFIG = {
    clientId: ' 304034846208- q5cumi606scpegkg7rgkbocfuh4fvj bh.apps.googleusercontent.com ' ,
    apiKey: 'AIzaSyDfmBG7mSKkrc8bvz3- rbrJ5IWQx4RmFHY',
    folderId: '1skx93vYn0OE9u- 64snbnds8DaOHQGu3G',
    scopes: ' https://www.googleapis.com/ auth/drive.readonly '
  };

  const FAMILY = {
    name: 'Bear Family',
    passwordHash: ' 16b6f231a768a99ff5c35d0f36e833 3b8592137316cd10f81ebe4d29e18f 3f97'
  };

  let googleAccessToken = null;

  // Interne helpers voor de loginfunctie
  hex(buffer){ return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2,'0') ).join(''); }
  async function sha256(str){
    const enc = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest('SHA-256' , enc);
    return hex(buf);
  }

  return {
    async login(password) {
      const hash = await sha256(password);
      if (hash === FAMILY.passwordHash) {
        localStorage.setItem('family_ auth', 'true');
        return true;
      }
      return false;
    },
    logout() { localStorage.removeItem(' family_auth'); },
    async requireAuth() {
      if (localStorage.getItem('family_auth ') !== 'true') { window.location.href = 'index.html'; }
    },

    async initDrive(callback) {
      const client = google.accounts.oauth2.initTokenClient ({
        client_id: DRIVE_CONFIG.clientId,
        scope: DRIVE_CONFIG.scopes,
        callback: (response) => {
          if (response.access_token) {
            googleAccessToken = response.access_token;
            if (callback) callback();
          }
        },
      });
      client.requestAccessToken();
    },

    async fetchPhotosFromDrive() {
      if (!googleAccessToken) return [];
     
      // Opgeschoonde query om 400-fouten te voorkomen
      const q = `'${DRIVE_CONFIG.folderId}' in parents and trashed = false`;
      const url = ` https://www.googleapis.com/ drive/v3/files?q=${ encodeURIComponent(q)}&fields= files(id,name,mimeType)` ;
     
      try {
        const res = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${googleAccessToken}`,
            'Accept': 'application/json'
          }
        });

        if (!res.ok) {
          const errorData = await res.json();
          console.error("Google Drive API-fout:", errorData);
          return [];
        }

        const data = await res.json();
        if (!data.files) return [];

        return data.files
          .filter(file => file.mimeType && file.mimeType.startsWith(' image/'))
          .map(file => ({
            title: file.name ,
            url: ` https://drive.google.com/ thumbnail?id=${file.id}&sz= w1200`
          }));
      } catch (err) {
        console.error("Ophaalverzoek mislukt:", err);
        return [];
      }
    }
  };
})();