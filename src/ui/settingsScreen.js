/** settingsScreen.js — renders the settings UI (audio sliders, camera type/distance, difficulty) and persists configurations. */
import { CONFIG } from '../core/config.js';
import { icon } from './icons.js';
import { initMagnetic, Toast } from './components.js';
import { CAMERA_PRESETS, PRESET_LABELS, migratePreset } from '../render/cameraController.js';

export function showSettingsModal(save, match = null, cameraController = null, onResume = null) {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop in';
  modal.style.zIndex = '9000';
  
  // Settings initialization defaults
  const audioMaster = save.audioMaster ?? 80;
  const audioCrowd = save.audioCrowd ?? 70;
  const audioSfx = save.audioSfx ?? 80;
  
  const camPreset = migratePreset(cameraController?.preset || save.cameraPreset);
  const camDistance = cameraController?.distance || save.cameraDistance || 1.0;

  const showNames = save.showPlayerNames !== false;
  const showBallTrail = save.showBallTrail !== false;

  modal.innerHTML = `
    <div class="modal-panel" style="max-width: 520px; max-height: 90vh; overflow-y: auto;">
      <div class="modal-header">
        <h2>${icon('gear', 22)} GAME SETTINGS</h2>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-content" style="display: flex; flex-direction: column; gap: 20px;">
        
        <!-- Audio Settings -->
        <div>
          <div class="section-tag">Audio Volume</div>
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span>Master Volume</span>
              <input type="range" id="sliderMaster" min="0" max="100" value="${audioMaster}">
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span>Crowd Effects</span>
              <input type="range" id="sliderCrowd" min="0" max="100" value="${audioCrowd}">
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span>Whistle & Kicks</span>
              <input type="range" id="sliderSfx" min="0" max="100" value="${audioSfx}">
            </div>
          </div>
        </div>

        <!-- Camera (DLS-style rows) -->
        <div>
          <div class="section-tag">Camera</div>
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span>Camera Type</span>
              <select id="selectCamPreset" class="btn" style="padding: 6px 12px; font-size: 13px; transform: none; width: 180px;">
                ${CAMERA_PRESETS.map(p =>
                  `<option value="${p}" ${camPreset === p ? 'selected' : ''}>${PRESET_LABELS[p]}</option>`
                ).join('')}
              </select>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span>Camera Distance <span id="camDistLabel" style="opacity:.7">(${Math.round(camDistance * 100)}%)</span></span>
              <input type="range" id="sliderCamDist" min="80" max="130" value="${Math.round(camDistance * 100)}">
            </div>
          </div>
        </div>

        <!-- Gameplay Settings -->
        <div>
          <div class="section-tag">Match & Gameplay</div>
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span>Half Length</span>
              <select id="selectLength" class="btn" style="padding: 6px 12px; font-size: 13px; transform: none; width: 120px;">
                <option value="120" ${save.halfLength === 120 ? 'selected' : ''}>2 Mins</option>
                <option value="240" ${save.halfLength === 240 ? 'selected' : ''}>4 Mins</option>
                <option value="360" ${save.halfLength === 360 ? 'selected' : ''}>6 Mins</option>
              </select>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span>Difficulty</span>
              <select id="selectDifficulty" class="btn" style="padding: 6px 12px; font-size: 13px; transform: none; width: 120px;">
                <option value="amateur" ${save.difficulty === 'amateur' ? 'selected' : ''}>Amateur</option>
                <option value="pro" ${save.difficulty === 'pro' ? 'selected' : ''}>Pro</option>
                <option value="legend" ${save.difficulty === 'legend' ? 'selected' : ''}>Legend</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Display Toggles -->
        <div>
          <div class="section-tag">Display Toggles</div>
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span>Show Player Nameplates</span>
              <input type="checkbox" id="checkNames" ${showNames ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;">
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span>Ball Shadow Trail</span>
              <input type="checkbox" id="checkTrail" ${showBallTrail ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;">
            </div>
          </div>
        </div>

      </div>
      <div class="modal-actions">
        <button class="btn modal-cancel">CANCEL</button>
        <button class="btn primary modal-ok">SAVE SETTINGS</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Live % label for the distance slider
  const distSlider = modal.querySelector('#sliderCamDist');
  distSlider.oninput = () => {
    modal.querySelector('#camDistLabel').textContent = `(${distSlider.value}%)`;
  };

  const dismiss = () => modal.remove();
  
  modal.querySelector('.modal-close').onclick = dismiss;
  modal.querySelector('.modal-cancel').onclick = dismiss;
  modal.onclick = (e) => { if (e.target === modal) dismiss(); };

  const okBtn = modal.querySelector('.modal-ok');
  initMagnetic(okBtn);
  initMagnetic(modal.querySelector('.modal-cancel'));

  okBtn.onclick = () => {
    // Persist slider/dropdown configurations
    save.audioMaster = parseInt(modal.querySelector('#sliderMaster').value);
    save.audioCrowd = parseInt(modal.querySelector('#sliderCrowd').value);
    save.audioSfx = parseInt(modal.querySelector('#sliderSfx').value);
    
    save.cameraPreset = modal.querySelector('#selectCamPreset').value;
    save.cameraDistance = parseFloat(modal.querySelector('#sliderCamDist').value) / 100;

    save.halfLength = parseInt(modal.querySelector('#selectLength').value);
    save.difficulty = modal.querySelector('#selectDifficulty').value;
    
    save.showPlayerNames = modal.querySelector('#checkNames').checked;
    save.showBallTrail = modal.querySelector('#checkTrail').checked;

    // Apply live to active match / cameras if mid-match
    if (cameraController) {
      cameraController.preset = save.cameraPreset;
      cameraController.setDistance(save.cameraDistance);
    }
    
    if (match) {
      match.halfLength = save.halfLength;
      match.diffParams = CONFIG.DIFFICULTY[save.difficulty];
    }

    localStorage.setItem('dreamkick.v2', JSON.stringify(save));
    Toast.show('Settings saved successfully.', 'success');
    
    dismiss();
    if (onResume) onResume();
  };
}
