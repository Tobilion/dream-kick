/** teamManagement.js — handles in-match and pre-match team management (subs, formations, and mentality changes). */
import { renderPlayerCard, showPlayerInfoPopup } from './playerCard.js';
import { initMagnetic, Toast } from './components.js';
import { FORMATIONS } from '../engine/team.js';

export function showTeamManagementModal(match, userTeamIdx, onComplete = null) {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop in';
  modal.style.zIndex = '9001';
  modal.style.background = 'rgba(7,9,18,0.95)';
  modal.style.backdropFilter = 'blur(10px)';

  const team = match.teams[userTeamIdx];
  const kitColors = team.club.kits.home;
  
  // Track selected cards for swapping/substitutions
  let selectedStarter = null;
  let selectedBench = null;
  let subsUsed = team.subsUsed || 0;

  // Gather players on bench (squad players not currently in starting lineup)
  const xiNumbers = new Set(team.players.map(p => p.data.num));
  let bench = team.club.squad.filter(p => !xiNumbers.has(p.num));

  const buildModalContent = () => {
    modal.innerHTML = `
      <div class="modal-panel" style="width: 96vw; max-width: 980px; max-height: 94vh; display: flex; flex-direction: column; gap: 16px; padding: 20px;">
        <div class="modal-header">
          <h2>TEAM MANAGEMENT — ${team.club.name.toUpperCase()}</h2>
          <button class="modal-close">&times;</button>
        </div>

        <div style="display: flex; gap: 20px; overflow-y: auto; flex: 1; min-height: 0;">
          
          <!-- Column 1: Formation Pitch View -->
          <div style="flex: 1.3; min-width: 0; display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span class="section-tag">Starting Formation</span>
              <div style="display: flex; gap: 6px;">
                ${['442', '433', '4231', '352', '532'].map(f => `
                  <button class="btn form-btn ${team.formation === f ? 'primary' : ''}" data-form="${f}" style="padding: 6px 12px; font-size: 12px;">${f}</button>
                `).join('')}
              </div>
            </div>

            <!-- Visual Pitch Layout: cards absolutely placed on formation slots -->
            <div id="mgtPitch" style="position: relative; flex: 1; background: rgba(0,60,20,0.35); border: 2px solid var(--border); border-radius: 8px; min-height: 420px; overflow: hidden;">
              <div style="position:absolute; inset:8%; border:1px solid rgba(255,255,255,0.15); border-radius:4px; pointer-events:none;"></div>
              <div style="position:absolute; left:8%; right:8%; top:50%; height:1px; background:rgba(255,255,255,0.15); pointer-events:none;"></div>
            </div>
          </div>

          <!-- Column 2: Substitutes Bench & Tactics -->
          <div style="flex: 1; min-width: 280px; display: flex; flex-direction: column; gap: 16px;">
            
            <!-- Substitutes List -->
            <div style="flex: 1; display: flex; flex-direction: column; gap: 6px; min-height: 0;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span class="section-tag">Substitutes Bench</span>
                <span style="font-size: 11px; color: var(--muted)">Subs: ${subsUsed}/5</span>
              </div>
              <div id="benchList" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 6px; background: rgba(0,0,0,0.15); border-radius: 6px; border: 1px solid var(--border);"></div>
            </div>

            <!-- Tactics / Settings sliders -->
            <div style="background: var(--surface); padding: 12px; border-radius: 8px; border: 1px solid var(--border); display: flex; flex-direction: column; gap: 10px;">
              <span class="section-tag">Team Mentality</span>
              <div style="display: flex; gap: 6px;">
                ${['defensive', 'balanced', 'attacking'].map(m => `
                  <button class="btn mentality-btn ${team.mentality === m ? 'primary' : ''}" data-mentality="${m}" style="flex: 1; font-size: 11px; padding: 6px 4px;">${m.toUpperCase()}</button>
                `).join('')}
              </div>
              
              <span class="section-tag" style="margin-top: 6px;">Pressing Intensity</span>
              <div style="display: flex; gap: 6px;">
                ${['low', 'mid', 'high'].map(p => `
                  <button class="btn pressing-btn ${team.pressingIntensity === p ? 'primary' : ''}" data-pressing="${p}" style="flex: 1; font-size: 11px; padding: 6px 4px;">${p.toUpperCase()}</button>
                `).join('')}
              </div>
            </div>

          </div>
        </div>

        <div class="modal-actions" style="margin-top: 0;">
          <div style="margin-right: auto; font-size: 12px; color: var(--muted);">
            Tip: Double-tap a card to view player ratings.
          </div>
          <button class="btn primary confirm-btn" style="min-width: 140px;">CONFIRM CHANGES</button>
        </div>
      </div>
    `;

    // Populate starting lineup on the pitch at their FORMATION SLOT coordinates,
    // so switching formation visibly rearranges the team.
    const pitchEl = modal.querySelector('#mgtPitch');
    const slots = FORMATIONS[team.formation] || FORMATIONS['442'];
    team.players.forEach(p => {
      const slot = slots[p.idx] || slots[0];
      const card = renderPlayerCard(p, kitColors, {
        className: `compact ${selectedStarter === p ? 'active' : ''}`,
        onClick: () => handleStarterClick(p),
        onDblClick: () => showPlayerInfoPopup(p, kitColors),
      });
      // slot.x: 0=own goal → bottom of the panel; slot.z: -1..1 → left/right
      card.style.position = 'absolute';
      card.style.left = `${50 + slot.z * 40}%`;
      card.style.top = `${88 - slot.x * 82}%`;
      card.style.transform = 'translate(-50%, -50%)';
      pitchEl.appendChild(card);
    });

    // Populate bench players list
    const benchContainer = modal.querySelector('#benchList');
    if (bench.length === 0) {
      benchContainer.innerHTML = '<div class="dim" style="padding: 20px; text-align: center; font-size: 12px;">No substitutes available</div>';
    } else {
      bench.forEach(bp => {
        const card = renderPlayerCard(bp, kitColors, {
          className: `rowcard ${selectedBench === bp ? 'active' : ''}`,
          onClick: () => handleBenchClick(bp),
          onDblClick: () => showPlayerInfoPopup(bp, kitColors),
        });
        benchContainer.appendChild(card);
      });
    }

    // Attach Mentality/Pressing/Formations listeners
    modal.querySelectorAll('.form-btn').forEach(btn => {
      btn.onclick = () => {
        changeFormation(btn.dataset.form);
        buildModalContent();
      };
    });

    modal.querySelectorAll('.mentality-btn').forEach(btn => {
      btn.onclick = () => {
        team.mentality = btn.dataset.mentality;
        modal.querySelectorAll('.mentality-btn').forEach(b => b.classList.remove('primary'));
        btn.classList.add('primary');
      };
    });

    modal.querySelectorAll('.pressing-btn').forEach(btn => {
      btn.onclick = () => {
        team.pressingIntensity = btn.dataset.pressing;
        modal.querySelectorAll('.pressing-btn').forEach(b => b.classList.remove('primary'));
        btn.classList.add('primary');
      };
    });

    modal.querySelector('.confirm-btn').onclick = () => {
      team.subsUsed = subsUsed;
      dismiss();
      if (onComplete) onComplete();
    };

    modal.querySelector('.modal-close').onclick = dismiss;
  };

  const handleStarterClick = (p) => {
    if (selectedBench) {
      // Perform substitution swap!
      performSub(p, selectedBench);
    } else if (selectedStarter === p) {
      selectedStarter = null;
      buildModalContent();
    } else if (selectedStarter) {
      // Swap positions/slots of the two starters
      swapStarterSlots(selectedStarter, p);
    } else {
      selectedStarter = p;
      buildModalContent();
    }
  };

  const handleBenchClick = (bp) => {
    if (selectedStarter) {
      performSub(selectedStarter, bp);
    } else {
      selectedBench = selectedBench === bp ? null : bp;
      buildModalContent();
    }
  };

  const performSub = (starter, benchPlayer) => {
    if (subsUsed >= 5) {
      Toast.show('Substitutions limit reached (max 5)!', 'warn');
      selectedStarter = null;
      selectedBench = null;
      buildModalContent();
      return;
    }

    // Swap starter's data with bench player stats
    const oldData = starter.data;
    starter.data = benchPlayer;
    starter.isGK = benchPlayer.pos === 'GK';
    starter.stamina = 100; // Fresh sub gets full stamina

    // Update 3D player mesh appearance if match rendering exists
    if (match._meshes) {
      const mesh = match._meshes.find(m => m.e === starter);
      if (mesh) mesh.updateAppearance(kitColors);
    }

    // Replace bench player array element
    bench = bench.map(bp => bp === benchPlayer ? oldData : bp);
    subsUsed++;

    Toast.show(`Subbed in ${benchPlayer.name.split(' ').pop()} for ${oldData.name.split(' ').pop()}`, 'success');

    selectedStarter = null;
    selectedBench = null;
    buildModalContent();
  };

  const swapStarterSlots = (p1, p2) => {
    const tempIdx = p1.idx;
    p1.idx = p2.idx;
    p2.idx = tempIdx;
    
    Toast.show('Player positions swapped.', 'success');
    selectedStarter = null;
    buildModalContent();
  };

  const changeFormation = (newForm) => {
    team.formation = newForm;
    // Sort field players by native position category (DF, MF, FW) to assign new coordinate slot indexes
    const gk = team.players.find(p => p.isGK);
    const field = team.players.filter(p => !p.isGK);
    
    field.sort((a, b) => {
      const order = { 'DF': 1, 'MF': 2, 'FW': 3 };
      return order[a.data.pos] - order[b.data.pos];
    });

    // Re-assign entity indexes 1 to 10 matching target coordinates
    gk.idx = 0;
    field.forEach((p, index) => {
      p.idx = 1 + index;
    });

    Toast.show(`Formation changed to ${newForm}`, 'success');
  };

  const dismiss = () => modal.remove();
  
  document.body.appendChild(modal);
  buildModalContent();
}
