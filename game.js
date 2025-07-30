const gameArea = document.getElementById('gameArea');
const startBtn = document.getElementById('startBtn');
const entityCountInput = document.getElementById('entityCount');

const entitySize = 28;
const speed = 2;
const avoidanceRadius = 100;
const avoidanceStrength = 0.6;
const chaseStrength = 0.8;

const separationDistance = 30;
const separationStrength = 0.9;

const smoothing = 0.2;
const wanderStrength = 0.05;

const emojiMap = {
  'X': '🪨',
  'O': '✂️',
  'A': '📜'
};

const obstacles = [
    {x: 200, y: 0, width: 50, height: 300},   // vertical corridor wall left
    {x: 550, y: 500, width: 50, height: 300}, // vertical corridor wall right
    {x: 250, y: 350, width: 350, height: 50}, // horizontal block in middle
  ];  

let entities = [];
let animationId = null;

function createObstacles() {
    // Remove old obstacles if any
    const oldObs = document.querySelectorAll('.obstacle');
    oldObs.forEach(o => gameArea.removeChild(o));
  
    for (const obs of obstacles) {
      const el = document.createElement('div');
      el.classList.add('obstacle');
      el.style.left = obs.x + 'px';
      el.style.top = obs.y + 'px';
      el.style.width = obs.width + 'px';
      el.style.height = obs.height + 'px';
      gameArea.appendChild(el);
    }
  }
  

function clearEntities() {
  for (const ent of entities) {
    gameArea.removeChild(ent.el);
  }
  entities = [];
}

function createEntities(letter, count) {
  const arr = [];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.classList.add('entity');
    el.textContent = emojiMap[letter];
    el.style.fontSize = entitySize + 'px';
    el.style.width = entitySize + 'px';
    el.style.height = entitySize + 'px';
    el.style.textAlign = 'center';
    el.style.lineHeight = entitySize + 'px';

    let x = Math.random() * (800 - entitySize);
    let y = Math.random() * (800 - entitySize);

    let angle = Math.random() * 2 * Math.PI;
    let dx = Math.cos(angle) * speed;
    let dy = Math.sin(angle) * speed;

    arr.push({el, x, y, dx, dy, letter});
    gameArea.appendChild(el);
  }
  return arr;
}

function distance(e1, e2) {
  const dx = e1.x - e2.x;
  const dy = e1.y - e2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function convertEntity(target, newLetter) {
  target.letter = newLetter;
  target.el.textContent = emojiMap[newLetter];
}

function normalizeVector(x, y) {
  const len = Math.sqrt(x * x + y * y);
  if (len === 0) return [0, 0];
  return [x / len, y / len];
}

function calculateAvoidance(entity, threats) {
  let avoidX = 0;
  let avoidY = 0;
  let count = 0;

  for (const threat of threats) {
    const dist = distance(entity, threat);
    if (dist > 0 && dist < avoidanceRadius) {
      let diffX = entity.x - threat.x;
      let diffY = entity.y - threat.y;
      const factor = (avoidanceRadius - dist) / avoidanceRadius;
      diffX /= dist;
      diffY /= dist;

      avoidX += diffX * factor;
      avoidY += diffY * factor;
      count++;
    }
  }

  if (count > 0) {
    avoidX /= count;
    avoidY /= count;
    return normalizeVector(avoidX, avoidY);
  }
  return [0, 0];
}

function calculateChase(entity, preyList) {
  let closestPrey = null;
  let minDist = Infinity;

  for (const prey of preyList) {
    const dist = distance(entity, prey);
    if (dist < minDist) {
      minDist = dist;
      closestPrey = prey;
    }
  }

  if (closestPrey) {
    let chaseX = closestPrey.x - entity.x;
    let chaseY = closestPrey.y - entity.y;
    return normalizeVector(chaseX, chaseY);
  }
  return [0, 0];
}

function calculateSeparation(entity, allEntities) {
  let sepX = 0;
  let sepY = 0;
  let count = 0;

  for (const other of allEntities) {
    if (other === entity) continue;
    const dist = distance(entity, other);
    if (dist > 0 && dist < separationDistance) {
      let diffX = entity.x - other.x;
      let diffY = entity.y - other.y;
      diffX /= dist;
      diffY /= dist;

      let factor = (separationDistance - dist) / separationDistance;
      sepX += diffX * factor;
      sepY += diffY * factor;
      count++;
    }
  }

  if (count > 0) {
    sepX /= count;
    sepY /= count;
    return normalizeVector(sepX, sepY);
  }
  return [0, 0];
}

function update() {
  const Xs = entities.filter(e => e.letter === 'X');
  const Os = entities.filter(e => e.letter === 'O');
  const As = entities.filter(e => e.letter === 'A');

  for (const entity of entities) {
    let avoidanceVec = [0, 0];
    let chaseVec = [0, 0];
    let separationVec = [0, 0];

    if (entity.letter === 'X') {
      avoidanceVec = calculateAvoidance(entity, As);
      chaseVec = calculateChase(entity, Os);
    } else if (entity.letter === 'O') {
      avoidanceVec = calculateAvoidance(entity, Xs);
      chaseVec = calculateChase(entity, As);
    } else if (entity.letter === 'A') {
      avoidanceVec = calculateAvoidance(entity, Os.concat(Xs));
      chaseVec = calculateChase(entity, Xs);
    }

    separationVec = calculateSeparation(entity, entities);

    let vx = entity.dx
           + avoidanceVec[0] * avoidanceStrength
           + chaseVec[0] * chaseStrength
           + separationVec[0] * separationStrength;

    let vy = entity.dy
           + avoidanceVec[1] * avoidanceStrength
           + chaseVec[1] * chaseStrength
           + separationVec[1] * separationStrength;

    // Normalize desired velocity
    let [normDx, normDy] = normalizeVector(vx, vy);

    // Smooth velocity change to avoid spins
    entity.dx = entity.dx * (1 - smoothing) + normDx * speed * smoothing;
    entity.dy = entity.dy * (1 - smoothing) + normDy * speed * smoothing;

    // Add tiny wander to break symmetry (optional)
    entity.dx += (Math.random() - 0.5) * wanderStrength;
    entity.dy += (Math.random() - 0.5) * wanderStrength;

    // Normalize final velocity after smoothing and wander
    let [finalDx, finalDy] = normalizeVector(entity.dx, entity.dy);
    entity.dx = finalDx * speed;
    entity.dy = finalDy * speed;

    // Move entity
    entity.x += entity.dx;
    entity.y += entity.dy;

    // Bounce off walls
    if (entity.x < 0) {
      entity.x = 0;
      entity.dx = -entity.dx;
    } else if (entity.x > 800 - entitySize) {
      entity.x = 800 - entitySize;
      entity.dx = -entity.dx;
    }

    if (entity.y < 0) {
      entity.y = 0;
      entity.dy = -entity.dy;
    } else if (entity.y > 800 - entitySize) {
      entity.y = 800 - entitySize;
      entity.dy = -entity.dy;
    }

    entity.el.style.left = entity.x + 'px';
    entity.el.style.top = entity.y + 'px';
  }

  // Conversion rules
  for (const xEnt of Xs) {
    for (const oEnt of Os) {
      if (distance(xEnt, oEnt) < entitySize) {
        convertEntity(oEnt, 'X');
      }
    }
  }

  for (const oEnt of Os) {
    for (const aEnt of As) {
      if (distance(oEnt, aEnt) < entitySize) {
        convertEntity(aEnt, 'O');
      }
    }
  }

  for (const aEnt of As) {
    for (const xEnt of Xs) {
      if (distance(aEnt, xEnt) < entitySize) {
        convertEntity(xEnt, 'A');
      }
    }
  }

  animationId = requestAnimationFrame(update);
}

startBtn.addEventListener('click', () => {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  clearEntities();

  let count = parseInt(entityCountInput.value);
  if (isNaN(count) || count < 1) count = 1;
  if (count > 50) count = 50;

  const entitiesX = createEntities('X', count);
  const entitiesO = createEntities('O', count);
  const entitiesA = createEntities('A', count);

  entities = [...entitiesX, ...entitiesO, ...entitiesA];

  update();
});
