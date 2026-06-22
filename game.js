/* Universe 12 prototype: deliberately small A-Frame components with shared state. */
const GAME = {
  health: 100, energy: 100, targetDead: false, alerted: false,
  invisibleUntil: 0, frozenUntil: 0, dashReadyAt: 0, ended: false,
  cooldowns: { dash: 1800, cloak: 8000, freeze: 9000 },
  reset() { location.reload(); },
  isInvisible() { return performance.now() < this.invisibleUntil; },
  isFrozen() { return performance.now() < this.frozenUntil; },
  spend(amount) { if (this.energy < amount) return false; this.energy -= amount; return true; },
  alert() { this.alerted = true; },
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
function makeNpc(el, color, label) {
  el.innerHTML = `<a-cylinder class="body" radius=".32" height="1.15" position="0 .75 0" color="${color}"></a-cylinder>
    <a-sphere radius=".23" position="0 1.55 0" color="#9ba9b2"></a-sphere>
    <a-box width=".5" height=".1" depth=".06" position="0 1.95 0" color="#07111a"></a-box>
    <a-text class="tag" value="${label}" align="center" width="2.5" color="${color}" position="0 1.92 .04"></a-text>`;
}

AFRAME.registerComponent('universe-game', {
  init() {
    this.updateEnvironmentStatus();
    this.el.addEventListener('loaded', () => { document.querySelector('#loading').style.opacity = 0; setTimeout(() => document.querySelector('#loading').remove(), 450); });
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
    GAME.energy = Math.min(100, GAME.energy + dt * .008);
    const rig = document.querySelector('#rig').object3D.position;
    const extraction = document.querySelector('#extraction').object3D.position;
    if (GAME.targetDead && flatDistance(rig, extraction) < 1.7) GAME.end(true, 'CONTRACT COMPLETE');
  }
});

AFRAME.registerComponent('player-controller', {
  init() {
    this.keys = {};
    this.forward = new THREE.Vector3(); this.right = new THREE.Vector3();
    addEventListener('keydown', e => { this.keys[e.code] = true; this.action(e.code); });
    addEventListener('keyup', e => this.keys[e.code] = false);
    addEventListener('mousedown', e => { if (e.button === 0) fireBlast(document.querySelector('#camera')); });
    this.el.addEventListener('ability', e => this.action(e.detail.code));
  },
  action(code) {
    const now = performance.now();
    if ((code === 'ShiftLeft' || code === 'ShiftRight') && now >= GAME.dashReadyAt && GAME.spend(18)) {
      this.el.sceneEl.camera.getWorldDirection(this.forward); this.forward.y = 0; this.forward.normalize();
      this.el.object3D.position.addScaledVector(this.forward, 4); GAME.dashReadyAt = now + GAME.cooldowns.dash;
    }
    if (code === 'KeyQ' && !GAME.isInvisible() && GAME.spend(30)) GAME.invisibleUntil = now + 5000;
    if (code === 'KeyE' && now >= GAME.frozenUntil && GAME.spend(40)) GAME.frozenUntil = now + 3000;
    if (code === 'KeyF') meleeAttack(document.querySelector('#camera'));
  },
  tick(_, dt) {
    if (GAME.ended) return;
    const camera = this.el.sceneEl.camera;
    camera.getWorldDirection(this.forward); this.forward.y = 0; this.forward.normalize();
    this.right.crossVectors(this.forward, camera.up).normalize();
    let f = (this.keys.KeyW ? 1 : 0) - (this.keys.KeyS ? 1 : 0);
    let s = (this.keys.KeyD ? 1 : 0) - (this.keys.KeyA ? 1 : 0);
    const stick = document.querySelector('#leftHand').components['tracked-controls']?.axis;
    if (stick) { s += stick[2] || 0; f -= stick[3] || 0; }
    const speed = dt * .0031;
    this.el.object3D.position.addScaledVector(this.forward, f * speed).addScaledVector(this.right, s * speed);
    this.el.object3D.position.x = THREE.MathUtils.clamp(this.el.object3D.position.x, -5.5, 5.5);
    this.el.object3D.position.z = THREE.MathUtils.clamp(this.el.object3D.position.z, -26, 10);
  }
});

AFRAME.registerComponent('blaster-hand', {
  init() {
    this.el.addEventListener('triggerdown', () => fireBlast(this.el));
    this.el.addEventListener('abuttondown', () => document.querySelector('#rig').emit('ability', { code: 'ShiftLeft' }));
  }
});
AFRAME.registerComponent('melee-hand', {
  init() {
    this.el.addEventListener('triggerdown', () => meleeAttack(this.el));
    this.el.addEventListener('gripdown', () => meleeAttack(this.el));
    this.el.addEventListener('xbuttondown', () => document.querySelector('#rig').emit('ability', { code: 'KeyQ' }));
    this.el.addEventListener('ybuttondown', () => document.querySelector('#rig').emit('ability', { code: 'KeyE' }));
  }
});

function fireBlast(source) {
  if (GAME.ended || !GAME.spend(8)) return;
  const ray = source.components?.raycaster;
  const hit = ray?.intersectedEls?.find(el => el.classList.contains('enemy'));
  if (hit) hit.emit('hit', { damage: 45 });
  const start = new THREE.Vector3(); source.object3D.getWorldPosition(start);
  const bolt = document.createElement('a-sphere'); bolt.setAttribute('radius', '.07'); bolt.setAttribute('color', '#56ffff');
  bolt.setAttribute('material', 'emissive: #00eaff; emissiveIntensity: 2'); bolt.object3D.position.copy(start);
  document.querySelector('a-scene').appendChild(bolt); setTimeout(() => bolt.remove(), 130);
  GAME.alert();
}
function meleeAttack(source) {
  if (GAME.ended) return;
  const p = new THREE.Vector3(); source.object3D.getWorldPosition(p);
  document.querySelectorAll('.enemy').forEach(enemy => { const q = new THREE.Vector3(); enemy.object3D.getWorldPosition(q); if (p.distanceTo(q) < 1.45) enemy.emit('hit', { damage: 100 }); });
}

AFRAME.registerComponent('guard-ai', {
  schema: { waypoints: { type: 'string' }, speed: { default: .9 } },
  init() {
    makeNpc(this.el, '#ef4967', 'GUARD'); this.hp = 100; this.index = 0; this.fireTimer = 0;
    this.points = this.data.waypoints.split(' ').map(p => { const [x,z] = p.split(',').map(Number); return new THREE.Vector3(x, 0, z); });
    this.el.addEventListener('hit', e => { this.hp -= e.detail.damage; if (this.hp <= 0) { this.el.classList.remove('enemy'); this.el.setAttribute('animation', 'property: scale; to: .01 .01 .01; dur: 180'); setTimeout(() => this.el.remove(), 200); } });
  },
  tick(time, dt) {
    if (GAME.ended || this.hp <= 0 || GAME.isFrozen()) return;
    const pos = this.el.object3D.position, player = document.querySelector('#rig').object3D.position;
    const toPlayer = new THREE.Vector3().subVectors(player, pos); const distance = toPlayer.length();
    const forward = new THREE.Vector3(0,0,1).applyQuaternion(this.el.object3D.quaternion);
    const sees = !GAME.isInvisible() && distance < 8.5 && forward.angleTo(toPlayer.normalize()) < .72;
    if (!GAME.isInvisible() && (sees || (GAME.alerted && distance < 12))) {
      GAME.alert(); this.el.object3D.lookAt(player.x, 1, player.z);
      if (time > this.fireTimer && distance < 9) { GAME.damage(8); this.fireTimer = time + 700; }
      if (distance > 2.4) pos.addScaledVector(toPlayer, this.data.speed * 1.35 * dt / 1000);
    } else {
      const goal = this.points[this.index], delta = new THREE.Vector3().subVectors(goal, pos);
      if (delta.length() < .25) this.index = (this.index + 1) % this.points.length;
      else { delta.normalize(); pos.addScaledVector(delta, this.data.speed * dt / 1000); this.el.object3D.lookAt(goal.x, 1, goal.z); }
    }
  }
});

AFRAME.registerComponent('target-ai', {
  init() {
    makeNpc(this.el, '#ffc34e', 'TARGET'); this.hp = 100;
    this.el.addEventListener('hit', e => { this.hp -= e.detail.damage; GAME.alert(); if (this.hp <= 0) { GAME.eliminateTarget(); this.el.classList.remove('enemy'); this.el.setAttribute('animation', 'property: rotation; to: 90 0 0; dur: 250'); } });
  },
  tick(_, dt) {
    if (GAME.ended || this.hp <= 0 || !GAME.alerted || GAME.isFrozen()) return;
    const escape = document.querySelector('#escape').object3D.position, pos = this.el.object3D.position;
    const delta = new THREE.Vector3().subVectors(escape, pos); delta.y = 0;
    if (delta.length() < 1.1) return GAME.end(false, 'TARGET ESCAPED');
    delta.normalize(); pos.addScaledVector(delta, 1.45 * dt / 1000); this.el.object3D.lookAt(escape.x, 1, escape.z);
  }
});

AFRAME.registerComponent('hud-display', {
  tick() {
    const now = performance.now();
    const cloak = Math.max(0, (GAME.invisibleUntil - now) / 1000).toFixed(1);
    const freeze = Math.max(0, (GAME.frozenUntil - now) / 1000).toFixed(1);
    document.querySelector('#hudStatus')?.setAttribute('value', `VIT ${Math.ceil(GAME.health)}  |  EN ${Math.floor(GAME.energy)}  |  CLK ${cloak}  |  FRZ ${freeze}`);
    document.querySelector('#hudObjective')?.setAttribute('value', GAME.targetDead ? 'OBJECTIVE: REACH EXTRACTION' : GAME.alerted ? 'ALERT: TARGET IS FLEEING' : 'OBJECTIVE: ELIMINATE TARGET');
    document.querySelector('#rig')?.setAttribute('visible', true);
  }
});

// Lightweight grid primitive, avoiding another dependency.
AFRAME.registerPrimitive('a-grid', {
  defaultComponents: { geometry: { primitive: 'plane' }, material: { shader: 'flat', wireframe: true }, rotation: { x: -90 } },
  mappings: { width: 'geometry.width', height: 'geometry.height', color: 'material.color' }
});
