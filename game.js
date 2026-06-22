/* Universe 12 prototype: deliberately small A-Frame components with shared state. */
const GAME = {
  health: 100, energy: 100, targetDead: false, alerted: false,
  invisibleUntil: 0, frozenUntil: 0, cloakReadyAt: 0, freezeReadyAt: 0, dashReadyAt: 0,
  missionEndsAt: 0, targetEscapeEndsAt: 0, targetEscapeDurationMs: 60000, ended: false,
  durations: { cloak: 5000, freeze: 5000 },
  cooldowns: { dash: 1800, cloak: 10000, freeze: 12000 },
  reset() { location.reload(); },
  isInvisible() { return performance.now() < this.invisibleUntil; },
  isFrozen() { return performance.now() < this.frozenUntil; },
  spend(amount) { if (this.energy < amount) return false; this.energy -= amount; return true; },
  alert() {
    this.alerted = true;
    if (!this.targetEscapeEndsAt) this.targetEscapeEndsAt = performance.now() + this.targetEscapeDurationMs;
  },
  damage(amount) {
    if (this.ended || this.isInvisible()) return;
    this.health = Math.max(0, this.health - amount);
    if (!this.health) this.end(false, 'ASSASSIN NEUTRALIZED');
  },
  eliminateTarget() { this.targetDead = true; this.alerted = true; },
  end(won, title) {
    if (this.ended) return;
    this.ended = true;
    const el = document.querySelector('#message');
    el.hidden = false;
    el.querySelector('h1').textContent = title;
    el.querySelector('p').textContent = won ? 'Contract complete. Universe 12 remembers nothing.' : 'The timeline continues without you.';
  }
};

function flatDistance(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function abilityState(now, activeUntil, readyAt) {
  if (now < activeUntil) return `ACTIVE ${Math.ceil((activeUntil - now) / 1000)}s`;
  if (now < readyAt) return `COOLDOWN ${Math.ceil((readyAt - now) / 1000)}s`;
  return 'READY';
}
function alertNearby(origin, radius = 10) {
  document.querySelectorAll('.enemy').forEach(enemy => {
    const position = enemy.object3D.position;
    if (flatDistance(origin, position) <= radius) enemy.emit('alerted');
  });
}
function enemyIsLookingAtPlayer(enemy) {
  const player = document.querySelector('#rig').object3D.position;
  const toPlayer = new THREE.Vector3().subVectors(player, enemy.object3D.position).setY(0).normalize();
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(enemy.object3D.quaternion).setY(0).normalize();
  return forward.dot(toPlayer) > 0.42;
}
function makeNpc(el, color, label) {
  el.innerHTML = `<a-cylinder class="body" radius=".32" height="1.15" position="0 .75 0" color="${color}"></a-cylinder>
    <a-sphere radius=".23" position="0 1.55 0" color="#9ba9b2"></a-sphere>
    <a-box width=".5" height=".1" depth=".06" position="0 1.95 0" color="#07111a"></a-box>
    <a-text class="tag" value="${label}" align="center" width="2.5" color="${color}" position="0 1.92 .04"></a-text>`;
}

AFRAME.registerComponent('universe-game', {
  schema: {
    missionMinutes: { default: 5, min: 5, max: 10 },
    targetEscapeSeconds: { default: 60, min: 10 }
  },
  init() {
    GAME.targetEscapeDurationMs = this.data.targetEscapeSeconds * 1000;
    this.rig = document.querySelector('#rig').object3D.position;
    this.extraction = document.querySelector('#extraction').object3D.position;
    this.updateEnvironmentStatus();
    this.el.addEventListener('loaded', () => {
      GAME.missionEndsAt = performance.now() + this.data.missionMinutes * 60000;
      document.querySelector('#loading').style.opacity = 0;
      setTimeout(() => document.querySelector('#loading').remove(), 450);
    });
    document.querySelector('#message button').onclick = () => GAME.reset();
    addEventListener('keydown', e => { if (e.code === 'Enter' && GAME.ended) GAME.reset(); });
  },
  async updateEnvironmentStatus() {
    const status = document.querySelector('#environmentStatus');
    if (!window.isSecureContext) {
      status.textContent = 'HTTPS REQUIRED — NOT A SECURE CONTEXT';
      status.className = 'error';
      return;
    }
    if (!navigator.xr) {
      status.textContent = 'HTTPS OK · WEBXR UNAVAILABLE ON THIS BROWSER';
      status.className = 'error';
      return;
    }
    const immersive = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
    status.textContent = immersive ? 'HTTPS OK · IMMERSIVE VR READY' : 'HTTPS OK · CONNECT A WEBXR HEADSET';
    status.className = immersive ? 'ready' : '';
  },
  tick(_, dt) {
    if (GAME.ended) return;
    const safeDt = Math.min(dt || 0, 50);
    GAME.energy = Math.min(100, GAME.energy + safeDt * .008);
    if (GAME.missionEndsAt && performance.now() >= GAME.missionEndsAt) return GAME.end(false, 'MISSION TIME EXPIRED');
    if (GAME.targetDead && flatDistance(this.rig, this.extraction) < 1.7) GAME.end(true, 'CONTRACT COMPLETE');
  }
});

AFRAME.registerComponent('player-controller', {
  schema: {
    turnMode: { default: 'snap', oneOf: ['snap', 'smooth'] },
    snapAngle: { default: 30 },
    smoothTurnSpeed: { default: 90 }
  },
  init() {
    this.keys = {};
    this.forward = new THREE.Vector3(); this.right = new THREE.Vector3(); this.move = new THREE.Vector3();
    this.camera = this.el.sceneEl.camera;
    this.leftHand = document.querySelector('#leftHand');
    this.rightHand = document.querySelector('#rightHand');
    this.groundY = this.el.object3D.position.y;
    this.verticalVelocity = 0; this.flying = false; this.snapReleased = true;
    addEventListener('keydown', e => { this.keys[e.code] = true; this.action(e.code); });
    addEventListener('keyup', e => this.keys[e.code] = false);
    addEventListener('mousedown', e => { if (e.button === 0) fireBlast(document.querySelector('#camera')); });
    this.el.addEventListener('ability', e => this.action(e.detail.code));
    this.el.addEventListener('jump', () => this.jump());
    this.el.addEventListener('toggle-flight', () => { this.flying = !this.flying; this.verticalVelocity = 0; });
  },
  action(code) {
    const now = performance.now();
    if ((code === 'ShiftLeft' || code === 'ShiftRight') && now >= GAME.dashReadyAt && GAME.spend(18)) {
      this.el.sceneEl.camera.getWorldDirection(this.forward); this.forward.y = 0; this.forward.normalize();
      this.el.object3D.position.addScaledVector(this.forward, 4); GAME.dashReadyAt = now + GAME.cooldowns.dash;
    }
    if (code === 'KeyQ' && now >= GAME.cloakReadyAt && GAME.spend(30)) {
      GAME.invisibleUntil = now + GAME.durations.cloak;
      GAME.cloakReadyAt = now + GAME.cooldowns.cloak;
    }
    if (code === 'KeyE' && now >= GAME.freezeReadyAt && GAME.spend(40)) {
      GAME.frozenUntil = now + GAME.durations.freeze;
      GAME.freezeReadyAt = now + GAME.cooldowns.freeze;
    }
    if (code === 'Space') this.jump();
    if (code === 'KeyT') this.data.turnMode = this.data.turnMode === 'snap' ? 'smooth' : 'snap';
    if (code === 'KeyF') meleeAttack(document.querySelector('#camera'));
  },
  jump() {
    if (this.flying) {
      this.el.object3D.position.y = Math.min(8, this.el.object3D.position.y + .45);
    } else if (this.el.object3D.position.y <= this.groundY + .02) {
      this.verticalVelocity = 4.8;
    }
  },
  tick(_, dt) {
    if (GAME.ended) return;
    const safeDt = Math.min(dt || 0, 50);
    this.camera.getWorldDirection(this.forward); this.forward.y = 0; this.forward.normalize();
    this.right.crossVectors(this.forward, this.camera.up).normalize();
    let f = (this.keys.KeyW ? 1 : 0) - (this.keys.KeyS ? 1 : 0);
    let s = (this.keys.KeyD ? 1 : 0) - (this.keys.KeyA ? 1 : 0);
    const leftAxis = this.leftHand.components['tracked-controls']?.axis;
    if (leftAxis && Number.isFinite(leftAxis[2]) && Number.isFinite(leftAxis[3])) {
      s += Math.abs(leftAxis[2]) > .15 ? leftAxis[2] : 0;
      f -= Math.abs(leftAxis[3]) > .15 ? leftAxis[3] : 0;
    }
    this.move.copy(this.forward).multiplyScalar(f).addScaledVector(this.right, s);
    if (this.move.lengthSq() > 1) this.move.normalize();
    this.el.object3D.position.addScaledVector(this.move, safeDt * .0031);

    const rightAxis = this.rightHand.components['tracked-controls']?.axis;
    const turn = rightAxis && Number.isFinite(rightAxis[2]) ? rightAxis[2] : 0;
    if (this.data.turnMode === 'smooth') {
      if (Math.abs(turn) > .15) this.el.object3D.rotation.y -= THREE.MathUtils.degToRad(this.data.smoothTurnSpeed) * turn * safeDt / 1000;
    } else if (Math.abs(turn) < .3) {
      this.snapReleased = true;
    } else if (Math.abs(turn) > .7 && this.snapReleased) {
      this.el.object3D.rotation.y -= THREE.MathUtils.degToRad(this.data.snapAngle) * Math.sign(turn);
      this.snapReleased = false;
    }

    if (!this.flying) {
      this.verticalVelocity -= 9.8 * safeDt / 1000;
      this.el.object3D.position.y += this.verticalVelocity * safeDt / 1000;
      if (this.el.object3D.position.y < this.groundY) { this.el.object3D.position.y = this.groundY; this.verticalVelocity = 0; }
    }
    this.el.object3D.position.x = THREE.MathUtils.clamp(this.el.object3D.position.x, -5.5, 5.5);
    this.el.object3D.position.z = THREE.MathUtils.clamp(this.el.object3D.position.z, -26, 10);
  }
});

AFRAME.registerComponent('right-controller', {
  init() {
    this.lastAPress = 0;
    this.rig = document.querySelector('#rig');
    this.el.addEventListener('abuttondown', () => {
      const now = performance.now();
      this.rig.emit(this.lastAPress && now - this.lastAPress < 320 ? 'toggle-flight' : 'jump');
      this.lastAPress = now;
    });
    this.el.addEventListener('bbuttondown', () => this.rig.emit('ability', { code: 'KeyE' }));
  }
});
AFRAME.registerComponent('left-controller', {
  init() {
    this.rig = document.querySelector('#rig');
    this.el.addEventListener('xbuttondown', () => fireBlast(this.el));
    this.el.addEventListener('ybuttondown', () => this.rig.emit('ability', { code: 'KeyQ' }));
  }
});

AFRAME.registerComponent('punch-hand', {
  init() {
    this.previous = new THREE.Vector3(); this.current = new THREE.Vector3();
    this.el.object3D.getWorldPosition(this.previous); this.nextPunchAt = 0;
  },
  tick(time, dt) {
    const safeDt = Math.min(Math.max(dt || 16, 8), 50);
    this.el.object3D.getWorldPosition(this.current);
    const speed = this.current.distanceTo(this.previous) / (safeDt / 1000);
    if (speed > 1.6 && time >= this.nextPunchAt) {
      punchAt(this.current);
      this.nextPunchAt = time + 350;
    }
    this.previous.copy(this.current);
  }
});

function fireBlast(source) {
  if (GAME.ended || !GAME.spend(8)) return;
  const raySource = source.components?.raycaster ? source : source.querySelector?.('[raycaster]');
  const ray = raySource?.components?.raycaster;
  const hit = ray?.intersectedEls?.find(el => el.classList.contains('enemy'));
  const silent = GAME.isFrozen() || GAME.isInvisible();
  if (hit) hit.emit('hit', { damage: 45, silent, source: 'ki' });
  const start = new THREE.Vector3(); source.object3D.getWorldPosition(start);
  const bolt = document.createElement('a-sphere'); bolt.setAttribute('radius', '.07'); bolt.setAttribute('color', '#56ffff');
  bolt.setAttribute('material', 'emissive: #00eaff; emissiveIntensity: 2'); bolt.object3D.position.copy(start);
  document.querySelector('a-scene').appendChild(bolt); setTimeout(() => bolt.remove(), 130);
  if (!silent) {
    const alertOrigin = hit ? hit.object3D.position : start;
    alertNearby(alertOrigin, 10);
  }
}
function meleeAttack(source) {
  if (GAME.ended) return;
  const p = new THREE.Vector3(); source.object3D.getWorldPosition(p);
  punchAt(p, 1.45);
}
function punchAt(position, radius = .65) {
  if (GAME.ended) return;
  document.querySelectorAll('.enemy').forEach(enemy => {
    const enemyPosition = new THREE.Vector3(); enemy.object3D.getWorldPosition(enemyPosition);
    if (position.distanceTo(enemyPosition) > radius) return;
    const stealth = !enemyIsLookingAtPlayer(enemy);
    const isGuard = enemy.classList.contains('guard');
    const damage = stealth ? (isGuard ? 1000 : 80) : 35;
    enemy.emit('hit', { damage, silent: stealth, stealth, source: 'punch' });
  });
}

AFRAME.registerComponent('guard-ai', {
  schema: { waypoints: { type: 'string' }, speed: { default: .9 } },
  init() {
    makeNpc(this.el, '#ef4967', 'GUARD'); this.hp = 100; this.index = 0; this.fireTimer = 0; this.alerted = false;
    this.player = document.querySelector('#rig').object3D.position;
    this.toPlayer = new THREE.Vector3(); this.forward = new THREE.Vector3(); this.delta = new THREE.Vector3();
    this.points = this.data.waypoints.split(' ').map(p => { const [x,z] = p.split(',').map(Number); return new THREE.Vector3(x, 0, z); });
    this.el.addEventListener('alerted', () => { this.alerted = true; });
    this.el.addEventListener('hit', e => {
      this.hp -= e.detail.damage;
      if (!e.detail.silent) { this.alerted = true; alertNearby(this.el.object3D.position, 10); }
      if (this.hp <= 0) { this.el.classList.remove('enemy'); this.el.setAttribute('animation', 'property: scale; to: .01 .01 .01; dur: 180'); setTimeout(() => this.el.remove(), 200); }
    });
  },
  tick(time, dt) {
    if (GAME.ended || this.hp <= 0 || GAME.isFrozen()) return;
    const safeDt = Math.min(dt || 0, 50), pos = this.el.object3D.position;
    this.toPlayer.subVectors(this.player, pos); const distance = this.toPlayer.length();
    if (distance > .001) this.toPlayer.multiplyScalar(1 / distance);
    this.forward.set(0, 0, 1).applyQuaternion(this.el.object3D.quaternion).normalize();
    const sees = !GAME.isInvisible() && distance < 8.5 && this.forward.dot(this.toPlayer) > .75;
    if (sees && !this.alerted) { this.alerted = true; alertNearby(pos, 10); }
    if (!GAME.isInvisible() && (sees || (this.alerted && distance < 12))) {
      this.el.object3D.lookAt(this.player.x, 1, this.player.z);
      if (time > this.fireTimer && distance < 9) { GAME.damage(8); this.fireTimer = time + 700; }
      if (distance > 2.4) pos.addScaledVector(this.toPlayer, this.data.speed * 1.35 * safeDt / 1000);
    } else {
      const goal = this.points[this.index]; this.delta.subVectors(goal, pos);
      if (this.delta.length() < .25) this.index = (this.index + 1) % this.points.length;
      else { this.delta.normalize(); pos.addScaledVector(this.delta, this.data.speed * safeDt / 1000); this.el.object3D.lookAt(goal.x, 1, goal.z); }
    }
  }
});

AFRAME.registerComponent('target-ai', {
  init() {
    makeNpc(this.el, '#ffc34e', 'TARGET'); this.hp = 100; this.delta = new THREE.Vector3();
    this.escape = document.querySelector('#escape').object3D.position;
    this.el.addEventListener('alerted', () => GAME.alert());
    this.el.addEventListener('hit', e => {
      this.hp -= e.detail.damage;
      if (!e.detail.silent) GAME.alert();
      if (this.hp <= 0) { GAME.eliminateTarget(); this.el.classList.remove('enemy'); this.el.setAttribute('animation', 'property: rotation; to: 90 0 0; dur: 250'); }
    });
  },
  tick(time, dt) {
    if (GAME.ended || this.hp <= 0 || !GAME.alerted || GAME.isFrozen()) return;
    if (performance.now() >= GAME.targetEscapeEndsAt) return GAME.end(false, 'TARGET ESCAPED');
    const safeDt = Math.min(dt || 0, 50), pos = this.el.object3D.position;
    this.delta.subVectors(this.escape, pos); this.delta.y = 0;
    if (this.delta.length() > .3) {
      this.delta.normalize(); pos.addScaledVector(this.delta, .12 * safeDt / 1000);
      this.el.object3D.lookAt(this.escape.x, 1, this.escape.z);
    }
  }
});

AFRAME.registerComponent('hud-display', {
  init() {
    this.nextUpdate = 0;
    this.status = document.querySelector('#hudStatus');
    this.abilities = document.querySelector('#hudAbilities');
    this.objective = document.querySelector('#hudObjective');
    this.timer = document.querySelector('#hudTimer');
    this.player = document.querySelector('#rig').components['player-controller'];
  },
  tick(time) {
    if (time < this.nextUpdate) return;
    this.nextUpdate = time + 100;
    if (!this.player) this.player = document.querySelector('#rig').components['player-controller'];
    const now = performance.now();
    const cloak = abilityState(now, GAME.invisibleUntil, GAME.cloakReadyAt);
    const freeze = abilityState(now, GAME.frozenUntil, GAME.freezeReadyAt);
    const movement = `${this.player?.flying ? 'FLY' : 'GROUND'} · ${(this.player?.data.turnMode || 'snap').toUpperCase()} TURN`;
    this.timer?.setAttribute('value', `MISSION 1 // ${formatTime(GAME.missionEndsAt - now)}`);
    this.status?.setAttribute('value', `VIT ${Math.ceil(GAME.health)}  |  EN ${Math.floor(GAME.energy)}  |  ${movement}`);
    this.abilities?.setAttribute('value', `CLOAK ${cloak}  |  FREEZE ${freeze}`);
    const escape = GAME.targetEscapeEndsAt ? formatTime(GAME.targetEscapeEndsAt - now) : '';
    this.objective?.setAttribute('value', GAME.targetDead ? 'OBJECTIVE: REACH EXTRACTION' : GAME.alerted ? `TARGET ESCAPING // ${escape}` : 'OBJECTIVE: ELIMINATE TARGET');
  }
});

// Lightweight grid primitive, avoiding another dependency.
AFRAME.registerPrimitive('a-grid', {
  defaultComponents: { geometry: { primitive: 'plane' }, material: { shader: 'flat', wireframe: true }, rotation: { x: -90 } },
  mappings: { width: 'geometry.width', height: 'geometry.height', color: 'material.color' }
});
