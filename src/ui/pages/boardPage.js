import { CLUBS } from '../../data/teams.js';
import { pageShell, fmtCoins } from '../hub.js';
import { icon } from '../icons.js';
import { getConfidenceLabel, getConfidenceColor, ensureBoardState, refreshObjectiveProgress } from '../../core/board.js';
import { leaguePosition } from '../../core/career.js';

export function boardPage(S, career) {
  ensureBoardState(career);
  refreshObjectiveProgress(career);

  const me = CLUBS[career.clubId];
  const board = career.board;
  const confidence = board.confidence;
  const label = getConfidenceLabel(confidence);
  const color = getConfidenceColor(confidence);

  const shell = pageShell('BOARDROOM', () => S.triggerWipe(() => S.career()),
    `<span>S${career.season} · MD ${career.week}</span>`);

  const render = () => {
    // Current league position and goals
    const pos = leaguePosition(career);
    const cup = career.cup;
    const userCupProgress = cup ? (cup.champion === career.clubId ? 5 : (cup.userOut !== null ? cup.userOut : cup.round)) : 0;

    shell.content.innerHTML = `
      <div class="panel" style="padding: 24px; text-align: center;">
        <div class="section-tag" style="margin-bottom: 12px;">BOARD CONFIDENCE</div>
        <div style="font-size: 36px; font-weight: 900; color: ${color}; transition: color 0.3s;">
          ${confidence}%
        </div>
        <div style="font-size: 18px; font-weight: 700; color: ${color}; letter-spacing: 0.05em; margin-bottom: 16px;">
          ${label.toUpperCase()}
        </div>
        
        <!-- Progress bar container -->
        <div style="width: 100%; max-width: 400px; height: 10px; background: rgba(255,255,255,0.08); border-radius: 5px; margin: 0 auto; overflow: hidden; position: relative;">
          <div style="width: ${confidence}%; height: 100%; background: ${color}; border-radius: 5px; transition: width 0.4s ease-out;"></div>
        </div>

        <div style="margin-top: 16px; font-size: 12px; color: var(--muted); max-width: 500px; margin-left: auto; margin-right: auto; line-height: 1.5;">
          The board assesses your performance after every matchday based on results, league standing, and cup run. Confidence below 25% at season end triggers dismissal.
        </div>
      </div>

      <div class="panel" style="padding: 20px;">
        <div class="section-tag" style="margin-bottom: 16px;">SEASON OBJECTIVES</div>
        <div style="display: flex; flex-direction: column; gap: 16px;">
          ${board.objectives.map(obj => {
            const isLeague = obj.type === 'league_position';
            const isCup = obj.type === 'cup_round';

            let currentText = '';
            let targetText = '';
            let progressPct = 0;

            if (isLeague) {
              currentText = `Current Position: ${pos}`;
              targetText = `Target: Top ${obj.target}`;
              // Position starts at 10 (worst) and goes to 1 (best)
              // If target is e.g. 6:
              // if current pos is 8, progress is less. Let's make a readable visual representation
              progressPct = pos <= obj.target ? 100 : Math.max(10, Math.round(((11 - pos) / (11 - obj.target)) * 100));
            } else if (isCup) {
              const roundNames = ['ROUND 1', 'ROUND 2', 'QF', 'SF', 'FINAL', 'WINNERS'];
              // userCupProgress vs obj.target
              currentText = `Current Stage: ${roundNames[userCupProgress] || 'Round 1'}`;
              targetText = `Target: ${roundNames[obj.target]}`;
              progressPct = Math.min(100, Math.round((userCupProgress / obj.target) * 100));
            }

            let badgeBg = 'rgba(255,255,255,0.06)';
            let badgeColor = 'var(--muted)';
            let badgeText = 'ACTIVE';

            if (obj.status === 'achieved') {
              badgeBg = 'rgba(0,212,163,0.12)';
              badgeColor = '#00d4a3';
              badgeText = 'ACHIEVED';
            } else if (obj.status === 'failed') {
              badgeBg = 'rgba(224,82,99,0.12)';
              badgeColor = '#e05263';
              badgeText = 'FAILED';
            }

            return `
              <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); padding: 16px; border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                  <div>
                    <div style="font-size: 14px; font-weight: 800; color: #fff;">
                      ${isLeague ? '🏆 LEAGUE POSITION' : '⚽ DREAM CUP RUN'}
                    </div>
                    <div style="font-size: 13px; color: var(--muted); margin-top: 4px;">
                      ${obj.description}
                    </div>
                  </div>
                  <span style="font-size: 10px; font-weight: 800; padding: 4px 8px; border-radius: 4px; background: ${badgeBg}; color: ${badgeColor}; letter-spacing: 0.05em;">
                    ${badgeText}
                  </span>
                </div>

                <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); margin-top: 12px; margin-bottom: 6px;">
                  <span>${currentText}</span>
                  <span style="font-weight: 700; color: var(--accent);">${targetText}</span>
                </div>

                <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden; position: relative;">
                  <div style="width: ${progressPct}%; height: 100%; background: ${obj.status === 'achieved' ? '#00d4a3' : (obj.status === 'failed' ? '#e05263' : 'var(--accent)')}; border-radius: 3px; transition: width 0.3s ease;"></div>
                </div>

                <div style="font-size: 11px; color: var(--muted); margin-top: 8px; display: flex; justify-content: space-between;">
                  <span>Expected Reward:</span>
                  <span style="font-weight: 700; color: #fff;">${fmtCoins(obj.reward)} coins</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  };

  render();
  S.show(shell.el);
  S.setupInteractions(shell.el);
}
