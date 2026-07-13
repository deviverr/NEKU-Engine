// Neku Studio — Co-op window (Team Create).
// Host a session (room code on the hosted relay), join with a code, or point
// at a self-hosted server. Shows who's online and what they have selected.

import { DEFAULT_RELAY, makeRoomCode, relayRoomUrl } from './collab.js';
import { getLocal, setLocal, SESSION } from './session.js';
import { toast } from './dialogs.js';

export function openCoop(winman, ed, collab) {
  winman.open({
    id: 'coop',
    title: 'CO-OP — TEAM CREATE',
    width: 380,
    content(body) {
      const render = () => {
        const online = collab.connected;
        const code = getLocal('neku-coop-room', '');
        const name = getLocal('neku-coop-name', SESSION.clientId.replace(/^client-/, 'dev-'));
        const relay = getLocal('neku-coop-relay', DEFAULT_RELAY);

        body.innerHTML = online ? `
          <div class="coop-live">
            <div class="coop-dot on"></div>
            <div>
              <b>Session live</b>
              <div class="coop-code-row">room <code class="coop-code">${code}</code>
                <button class="coop-copy" title="Copy room code">⧉</button></div>
            </div>
          </div>
          <div class="set-help">Teammates: Co-op → Join with this code — from the browser or desktop Studio, anywhere.</div>
          <div class="set-section">ONLINE NOW</div>
          <div class="coop-peers"></div>
          <div class="set-row"><button class="coop-leave danger-btn">Leave session</button></div>
        ` : `
          <div class="prop-row"><label>your name</label><input class="coop-name" type="text" value="${name}" maxlength="24" spellcheck="false" /></div>
          <div class="set-section">HOST A SESSION</div>
          <div class="set-help">Creates a room on the Neku relay. Share the code; edits sync live for everyone in it.</div>
          <div class="set-row"><button class="coop-host accent">◉ Host new session</button></div>
          <div class="set-section">JOIN A SESSION</div>
          <div class="coop-join-row">
            <input class="coop-code-in" type="text" placeholder="ROOM CODE" maxlength="12" spellcheck="false" />
            <button class="coop-join">Join</button>
          </div>
          <details class="coop-adv">
            <summary>Server settings</summary>
            <div class="prop-row"><label>relay</label><input class="coop-relay" type="text" value="${relay}" spellcheck="false" /></div>
            <div class="set-help">Default: the hosted Neku relay. For offline/LAN co-op run <code>npm run coop</code> and use <code>ws://YOUR-LAN-IP:8348</code>.</div>
            <div class="set-row"><button class="coop-relay-reset">Reset to hosted relay</button></div>
          </details>`;

        const readName = () => {
          const v = body.querySelector('.coop-name')?.value.trim() || name;
          setLocal('neku-coop-name', v);
          return v;
        };
        const readRelay = () => {
          const v = body.querySelector('.coop-relay')?.value.trim() || relay;
          setLocal('neku-coop-relay', v);
          return v;
        };

        if (online) {
          const peersBox = body.querySelector('.coop-peers');
          const renderPeers = () => {
            const rows = [{ name: readNameQuiet() + ' (you)', color: collab.color, selName: ed.sel?.name }];
            for (const p of ed.peers.values()) rows.push(p);
            peersBox.innerHTML = rows.map((p) =>
              `<div class="coop-peer"><span class="peer-chip" style="background:${p.color || 'var(--dim)'}"></span>
               <span>${esc(p.name || 'anon')}</span><span class="flex"></span>
               <span class="coop-sel">${p.selName ? '▸ ' + esc(p.selName) : ''}</span></div>`).join('');
          };
          const readNameQuiet = () => getLocal('neku-coop-name', 'you');
          renderPeers();
          ed.onPeersChanged = renderPeers; // editor pokes this on peer updates
          body.querySelector('.coop-copy').addEventListener('click', async () => {
            await navigator.clipboard?.writeText(code);
            toast('Room code copied: ' + code, 'ok');
          });
          body.querySelector('.coop-leave').addEventListener('click', () => {
            collab.disconnect();
            ed.onPeersChanged = null;
            render();
          });
        } else {
          body.querySelector('.coop-host').addEventListener('click', () => {
            const roomCode = makeRoomCode();
            setLocal('neku-coop-room', roomCode);
            connect(roomCode);
          });
          body.querySelector('.coop-join').addEventListener('click', joinFromInput);
          body.querySelector('.coop-code-in').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') joinFromInput();
          });
          body.querySelector('.coop-relay-reset')?.addEventListener('click', () => {
            body.querySelector('.coop-relay').value = DEFAULT_RELAY;
            setLocal('neku-coop-relay', DEFAULT_RELAY);
          });
          function joinFromInput() {
            const roomCode = body.querySelector('.coop-code-in').value.trim().toUpperCase();
            if (roomCode.length < 3) return toast('Enter a room code first', 'warn');
            setLocal('neku-coop-room', roomCode);
            connect(roomCode);
          }
          function connect(roomCode) {
            const relayUrl = readRelay();
            const isLocal = /^wss?:\/\//.test(relayUrl) && !/workers\.dev/.test(relayUrl) && !relayUrl.includes('/room/');
            const url = isLocal ? relayUrl.replace(/\/+$/, '') + '/room/' + roomCode : relayRoomUrl(relayUrl, roomCode);
            collab.connect({ url, room: roomCode, name: readName() });
          }
        }
      };

      const esc = (s) => String(s).replace(/</g, '&lt;');
      render();
      ed.onCoopStatus = render; // editor pokes this when status flips on/off
    },
    onClose() {
      ed.onCoopStatus = null;
      ed.onPeersChanged = null;
    },
  });
}
