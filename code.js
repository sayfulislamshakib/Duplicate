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
  const parent = node.parent;
  if (!parent || parent.type !== 'SECTION' || parent.locked) return;
  const SECTION_PADDING = 80;
  const resizeParent = (w, h) => {
    if (typeof parent.resize === 'function') parent.resize(w, h);
    else if (typeof parent.resizeWithoutConstraints === 'function') parent.resizeWithoutConstraints(w, h);
  };
  if (node.x + node.width > parent.width - SECTION_PADDING) resizeParent(node.x + node.width + SECTION_PADDING, parent.height);
  if (node.y + node.height > parent.height - SECTION_PADDING) resizeParent(parent.width, node.y + node.height + SECTION_PADDING);
  if (node.x < SECTION_PADDING) {
    const shift = node.x - SECTION_PADDING;
    resizeParent(parent.width - shift, parent.height);
    parent.x += shift;
    for (const child of parent.children) if (!child.locked) child.x -= shift;
  }
  if (node.y < SECTION_PADDING) {
    const shift = node.y - SECTION_PADDING;
    resizeParent(parent.width, parent.height - shift);
    parent.y += shift;
    for (const child of parent.children) if (!child.locked) child.y -= shift;
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