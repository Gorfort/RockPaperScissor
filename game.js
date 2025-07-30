const gameArea = document.getElementById('gameArea');
const startBtn = document.getElementById('startBtn');
const entityCountInput = document.getElementById('entityCount');

const gameWidth = 800;
const gameHeight = 800;

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

// Obstacles data (nested arrays)
const obstacles = [
  // Simple single rect obstacle
  [
    { x: 100, y: 100, width: 100, height: 30 }
  ],
  // Larger complex obstacle made of 5 parts
  [
    { x: 550, y: 400, width: 150, height: 40 },  // base horizontal
    { x: 440, y: 800, width: 40, height: 150 },  // tall vertical right
    { x: 300, y: 450, width: 60, height: 60 },   // square bottom left
    { x: 360, y: 490, width: 80, height: 30 },   // bottom middle rectangle
    { x: 300, y: 550, width: 180, height: 40 }   // bottom base wider
  ]
];

// Flatten obstacles to a single array for collision checks and rendering
const flattenedObstacles = obstacles.flat();

function randomizeObstacles() {
  for (const group of obstacles) {
    for (const obs of group) {
      // Randomize x, y so obstacle stays fully inside game area
      obs.x = Math.random() * (gameWidth - obs.width);
      obs.y = Math.random() * (gameHeight - obs.height);
    }
  }
}

let entities = [];
let animationId = null;

function clearEntities() {
    for (const ent of entities) {
      gameArea.removeChild(ent.el);
    }
    entities = [];
  
    // Also remove existing obstacles from DOM
    const existingObstacles = gameArea.querySelectorAll('.obstacle');
    existingObstacles.forEach(el => el.remove());
  
    // Remove existing winner message if present
    const oldMessage = gameArea.querySelector('.winner-message');
    if (oldMessage) oldMessage.remove();
  }  

function isInsideObstacle(x, y, size) {
  for (const obs of flattenedObstacles) {
    if (
      x + size > obs.x &&
      x < obs.x + obs.width &&
      y + size > obs.y &&
      y < obs.y + obs.height
    ) {
      return true;
    }
  }
  return false;
}

function renderObstacles(gameArea) {
  for (const obs of flattenedObstacles) {
    const el = document.createElement('div');
    el.classList.add('obstacle');
    el.style.left = obs.x + 'px';
    el.style.top = obs.y + 'px';
    el.style.width = obs.width + 'px';
    el.style.height = obs.height + 'px';
    el.style.position = 'absolute';
    el.style.backgroundColor = 'lightgray';
    gameArea.appendChild(el);
  }
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

    let x, y;

    // Keep trying random positions until it’s not inside any obstacle
    do {
      x = Math.random() * (gameWidth - entitySize);
      y = Math.random() * (gameHeight - entitySize);
    } while (isInsideObstacle(x, y, entitySize));

    let angle = Math.random() * 2 * Math.PI;
    let dx = Math.cos(angle) * speed;
    let dy = Math.sin(angle) * speed;

    arr.push({ el, x, y, dx, dy, letter, lastConverted: 0 });
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
  target.lastConverted = Date.now();  // Update last conversion time here
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
    const now = Date.now();
  
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
  
      let [normDx, normDy] = normalizeVector(vx, vy);
  
      // Smoothly update velocity direction
      entity.dx = entity.dx * (1 - smoothing) + normDx * speed * smoothing;
      entity.dy = entity.dy * (1 - smoothing) + normDy * speed * smoothing;
  
      // === Add gentle random acceleration for subtle speed variation ===
      const randomAccelMax = 1;  // max random change per frame
      entity.dx += (Math.random() * 2 - 1) * randomAccelMax;
      entity.dy += (Math.random() * 2 - 1) * randomAccelMax;
  
      // Limit speed to roughly between 0.8 * speed and 1.2 * speed
      let currentSpeed = Math.sqrt(entity.dx * entity.dx + entity.dy * entity.dy);
      const minSpeed = speed * 0.5;
      const maxSpeed = speed * 1.5;
  
      if (currentSpeed < minSpeed) {
        let scale = minSpeed / currentSpeed;
        entity.dx *= scale;
        entity.dy *= scale;
      } else if (currentSpeed > maxSpeed) {
        let scale = maxSpeed / currentSpeed;
        entity.dx *= scale;
        entity.dy *= scale;
      }
  
      // Calculate proposed next position
      let nextX = entity.x + entity.dx;
      let nextY = entity.y + entity.dy;
  
      // Check horizontal collision with obstacles
      let hitHorizontal = false;
      for (const obs of flattenedObstacles) {
        if (
          nextX + entitySize > obs.x &&
          nextX < obs.x + obs.width &&
          entity.y + entitySize > obs.y &&
          entity.y < obs.y + obs.height
        ) {
          hitHorizontal = true;
          break;
        }
      }
      if (hitHorizontal) {
        entity.dx = -entity.dx; // Bounce horizontally
        nextX = entity.x + entity.dx;
      }
  
      // Check vertical collision with obstacles
      let hitVertical = false;
      for (const obs of flattenedObstacles) {
        if (
          entity.x + entitySize > obs.x &&
          entity.x < obs.x + obs.width &&
          nextY + entitySize > obs.y &&
          nextY < obs.y + obs.height
        ) {
          hitVertical = true;
          break;
        }
      }
      if (hitVertical) {
        entity.dy = -entity.dy; // Bounce vertically
        nextY = entity.y + entity.dy;
      }
  
      // Assign final position after obstacle collision handling
      entity.x = nextX;
      entity.y = nextY;
  
      // Bounce off walls (main frame boundaries)
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
  
    // Conversion rules with 0.5s cooldown
    for (const xEnt of Xs) {
      for (const oEnt of Os) {
        if (distance(xEnt, oEnt) < entitySize && now - oEnt.lastConverted > 500) {
          convertEntity(oEnt, 'X');
        }
      }
    }
  
    for (const oEnt of Os) {
      for (const aEnt of As) {
        if (distance(oEnt, aEnt) < entitySize && now - aEnt.lastConverted > 500) {
          convertEntity(aEnt, 'O');
        }
      }
    }
  
    for (const aEnt of As) {
      for (const xEnt of Xs) {
        if (distance(aEnt, xEnt) < entitySize && now - xEnt.lastConverted > 500) {
          convertEntity(xEnt, 'A');
        }
      }
    }
  
    const counts = {
        X: Xs.length,
        O: Os.length,
        A: As.length,
      };
    
      // Count how many groups still have entities > 0
      const activeGroups = Object.values(counts).filter(c => c > 0).length;
    
      if (activeGroups === 1) {
        // Only one group left — game over
        cancelAnimationFrame(animationId);
        animationId = null;
    
        let winnerLetter = null;
        if (counts.X > 0) winnerLetter = 'X';
        else if (counts.O > 0) winnerLetter = 'O';
        else if (counts.A > 0) winnerLetter = 'A';
    
        const winnerNameMap = {
          X: 'Rocks',
          O: 'Scissors',
          A: 'Paper'
        };
    
        const winnerEmojiMap = {
          X: '🪨',
          O: '✂️',
          A: '📜'
        };
    
        // Clear existing entities and obstacles from game area
        clearEntities();
    
        // Show winner message
        const message = document.createElement('div');
        message.classList.add('winner-message');  // <-- Add this line
        message.style.position = 'absolute';
        message.style.top = '50%';
        message.style.left = '50%';
        message.style.transform = 'translate(-50%, -50%)';
        message.style.fontSize = '48px';
        message.style.color = 'black';
        message.style.fontWeight = 'bold';
        message.style.textAlign = 'center';
        message.textContent = `${winnerNameMap[winnerLetter]} win ${winnerEmojiMap[winnerLetter]}`;
    
        gameArea.appendChild(message);
    
        return; // stop the update loop
      }
    
      animationId = requestAnimationFrame(update);
    }

startBtn.addEventListener('click', () => {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  
    clearEntities();
  
    // Randomize obstacle positions before rendering
    randomizeObstacles();
  
    renderObstacles(gameArea);
  
    let count = parseInt(entityCountInput.value);
    if (isNaN(count) || count < 1) count = 1;
    if (count > 50) count = 50;
  
    const entitiesX = createEntities('X', count);
    const entitiesO = createEntities('O', count);
    const entitiesA = createEntities('A', count);
  
    entities = [...entitiesX, ...entitiesO, ...entitiesA];
  
    update();
  });