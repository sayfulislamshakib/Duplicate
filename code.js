// Helper to determine gap based on frame width
function getDetectedGap(nodes) {
  if (!nodes || nodes.length === 0) return 40;
  const width = nodes[0].width;
  return width > 400 ? 100 : 40;
}

/**
 * Pushes siblings of a node in a given direction to make room for a duplicate.
 * Only pushes elements that are aligned with the original node (within its "corridor").
 */
function pushSiblings(originalNode, direction, shiftX, shiftY, excludedIds) {
  const parent = originalNode.parent;
  if (!parent) return;

  const margin = 0.5;
  const nodesToMove = new Set();
  
  // Starting target rectangle for the new duplicate
  let targetX = originalNode.x;
  let targetY = originalNode.y;
  if (direction.includes('left')) targetX -= shiftX;
  else if (direction.includes('right')) targetX += shiftX;
  if (direction.includes('top')) targetY -= shiftY;
  else if (direction.includes('bottom')) targetY += shiftY;

  const checkQueue = [{
    x: targetX,
    y: targetY,
    width: originalNode.width,
    height: originalNode.height
  }];
  
  const processed = new Set(excludedIds);

  while (checkQueue.length > 0) {
    const rect = checkQueue.shift();
    
    for (const sibling of parent.children) {
      if (processed.has(sibling.id)) continue;

      // Check for overlap with the current rectangle in the collision chain
      const overlaps = (sibling.x < rect.x + rect.width - margin) && 
                       (sibling.x + sibling.width > rect.x + margin) &&
                       (sibling.y < rect.y + rect.height - margin) && 
                       (sibling.y + sibling.height > rect.y + margin);

      if (overlaps) {
        nodesToMove.add(sibling);
        processed.add(sibling.id);
        
        // Add this sibling's future position to the queue to check for further collisions
        checkQueue.push({
          x: sibling.x + (direction.includes('left') ? -shiftX : (direction.includes('right') ? shiftX : 0)),
          y: sibling.y + (direction.includes('top') ? -shiftY : (direction.includes('bottom') ? shiftY : 0)),
          width: sibling.width,
          height: sibling.height
        });
      }
    }
  }

  for (const node of nodesToMove) {
    if (direction.includes('left')) node.x -= shiftX;
    else if (direction.includes('right')) node.x += shiftX;
    if (direction.includes('top')) node.y -= shiftY;
    else if (direction.includes('bottom')) node.y += shiftY;
  }
}

// Function to handle the duplication logic
async function performDuplicate(direction, gap, pushEnabled) {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.notify("⚠️ Please select at least one frame to duplicate.");
    return;
  }

  // Sort selection based on direction to prevent overlapping "pushes"
  const sortedSelection = [...selection].sort((a, b) => {
    if (direction.includes('right')) return b.x - a.x;
    if (direction.includes('left')) return a.x - b.x;
    if (direction.includes('bottom')) return b.y - a.y;
    if (direction.includes('top')) return a.y - b.y;
    return 0;
  });

  const newSelection = [];
  const processedIds = new Set(selection.map(n => n.id));
  let autoLayoutWarning = false;
  let lastUsedEffectiveGap = 40;

  for (const node of sortedSelection) {
    const parent = node.parent;
    if (!parent) continue;

    const effectiveGap = (gap !== undefined && gap !== null) ? gap : (node.width > 400 ? 100 : 40);
    lastUsedEffectiveGap = effectiveGap;

    try {
      const isAutoLayout = 'layoutMode' in parent && (parent.layoutMode !== 'NONE');

      if (isAutoLayout) {
        const clone = node.clone();
        const index = parent.children.indexOf(node);
        let newIndex = index + (direction.includes('right') || direction.includes('bottom') ? 1 : 0);
        if (typeof parent.insertChild === 'function') parent.insertChild(newIndex, clone);
        else parent.appendChild(clone);
        newSelection.push(clone);
        autoLayoutWarning = true;
      } else {
        const shiftX = node.width + effectiveGap;
        const shiftY = node.height + effectiveGap;

        // Push existing siblings if enabled
        if (pushEnabled) {
          pushSiblings(node, direction, shiftX, shiftY, processedIds);
        }

        const clone = node.clone();
        parent.appendChild(clone);

        if (direction.includes('left')) clone.x = node.x - shiftX;
        else if (direction.includes('right')) clone.x = node.x + shiftX;
        else clone.x = node.x;

        if (direction.includes('top')) clone.y = node.y - shiftY;
        else if (direction.includes('bottom')) clone.y = node.y + shiftY;
        else clone.y = node.y;

        processedIds.add(clone.id);
        expandSectionIfNeeded(clone);
        newSelection.push(clone);
      }
    } catch (err) {
      console.error("Error processing node:", err);
      figma.notify(`❌ Failed to duplicate: ${err.message}`, { error: true });
    }
  }

  if (newSelection.length > 0) {
    const dirLabel = direction.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
    if (autoLayoutWarning) figma.notify(`✅ Duplicated. Spacing handled by Auto Layout.`);
    else figma.notify(`✅ Duplicated ${dirLabel} with ${lastUsedEffectiveGap}px gap.`);
  }
}

function expandSectionIfNeeded(node) {
  let section = node.parent;
  // Find the Section ancestor
  while (section && section.type !== 'SECTION' && section.type !== 'PAGE') {
    section = section.parent;
  }
  
  if (!section || section.type !== 'SECTION' || section.locked) return;

  const PADDING = 80;
  
  // Calculate the collective bounds of all children relative to the section origin
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  if (section.children.length === 0) return;

  for (const child of section.children) {
    minX = Math.min(minX, child.x);
    minY = Math.min(minY, child.y);
    maxX = Math.max(maxX, child.x + child.width);
    maxY = Math.max(maxY, child.y + child.height);
  }

  // Determine if we need to shift children (if they're too close to the left/top edges)
  let shiftX = minX < PADDING ? PADDING - minX : 0;
  let shiftY = minY < PADDING ? PADDING - minY : 0;

  // The required width/height considering the right/bottom-most child and any shift
  const requiredWidth = maxX + PADDING + shiftX;
  const requiredHeight = maxY + PADDING + shiftY;

  const newWidth = Math.max(section.width + shiftX, requiredWidth);
  const newHeight = Math.max(section.height + shiftY, requiredHeight);

  if (newWidth > section.width || newHeight > section.height || shiftX > 0 || shiftY > 0) {
    const resizeSection = (w, h) => {
      if (typeof section.resize === 'function') section.resize(w, h);
      else if (typeof section.resizeWithoutConstraints === 'function') section.resizeWithoutConstraints(w, h);
    };

    resizeSection(newWidth, newHeight);

    if (shiftX > 0 || shiftY > 0) {
      section.x -= shiftX;
      section.y -= shiftY;
      for (const child of section.children) {
        if (!child.locked) {
          child.x += shiftX;
          child.y += shiftY;
        }
      }
    }
  }
}

let isAutoDetectEnabled = true;
let isPushEnabled = true;

if (figma.command === 'open_ui' || figma.command === '') {
  figma.showUI(__html__, { width: 240, height: 380 });
  const initialGap = getDetectedGap(figma.currentPage.selection);
  
  Promise.all([
    figma.clientStorage.getAsync('autoDetect'),
    figma.clientStorage.getAsync('lastUsedGap'),
    figma.clientStorage.getAsync('pushEnabled')
  ]).then(([storedAutoDetect, gap, storedPush]) => {
    if (storedAutoDetect !== undefined) isAutoDetectEnabled = storedAutoDetect;
    if (storedPush !== undefined) isPushEnabled = storedPush;
    
    figma.ui.postMessage({ 
      type: 'load-settings', 
      gap: gap !== undefined ? gap : initialGap,
      autoDetect: isAutoDetectEnabled,
      push: isPushEnabled
    });
  });
} else {
  Promise.all([
    figma.clientStorage.getAsync('autoDetect'),
    figma.clientStorage.getAsync('lastUsedGap'),
    figma.clientStorage.getAsync('pushEnabled')
  ]).then(([storedAutoDetect, gap, storedPush]) => {
    const autoDetect = (storedAutoDetect !== undefined) ? storedAutoDetect : true;
    const push = (storedPush !== undefined) ? storedPush : true;
    const finalGap = autoDetect ? null : (gap !== undefined ? gap : 40);
    
    performDuplicate(figma.command, finalGap, push).then(() => figma.closePlugin());
  });
}

figma.on("selectionchange", () => {
  if (isAutoDetectEnabled) {
    const gap = getDetectedGap(figma.currentPage.selection);
    figma.ui.postMessage({ type: 'update-gap', gap });
  }
});

figma.ui.onmessage = msg => {
  if (msg.type === 'resize') figma.ui.resize(Math.ceil(msg.width), Math.ceil(msg.height));
  if (msg.type === 'toggle-auto-detect') {
    isAutoDetectEnabled = msg.enabled;
    figma.clientStorage.setAsync('autoDetect', msg.enabled);
    if (isAutoDetectEnabled) figma.ui.postMessage({ type: 'update-gap', gap: getDetectedGap(figma.currentPage.selection) });
  }
  if (msg.type === 'toggle-push') {
    isPushEnabled = msg.enabled;
    figma.clientStorage.setAsync('pushEnabled', msg.enabled);
  }
  if (msg.type === 'duplicate') {
    figma.clientStorage.setAsync('lastUsedGap', msg.gap);
    figma.clientStorage.setAsync('autoDetect', msg.autoDetect);
    figma.clientStorage.setAsync('pushEnabled', msg.push);
    isAutoDetectEnabled = msg.autoDetect;
    isPushEnabled = msg.push;
    performDuplicate(msg.direction, msg.autoDetect ? null : msg.gap, msg.push);
  }
};