/**
 * Message Observer - DOM monitoring for Google Chat messages
 * Uses MutationObserver to detect new messages and extract data
 *
 * ⚠️ WARNING: DOM selectors need to be updated after inspecting actual Google Chat DOM
 * Run `npm start` and use DevTools to identify correct selectors
 * See DOM_RESEARCH_GUIDE.md for instructions
 */

import { SELECTORS } from '../shared/constants.js';
import type { MessageData } from '../shared/types.js';

let observer: MutationObserver | null = null;
const processedMessages = new Set<string>(); // Deduplication cache

/**
 * Extract message data from DOM element
 * TODO: Update selectors after DOM inspection
 */
function extractMessageData(messageElement: Element): MessageData | null {
  try {
    // TODO: Replace these selectors with actual Google Chat selectors
    // after running npm start and inspecting the DOM

    // Extract message ID (for deduplication)
    const messageId =
      messageElement.getAttribute(SELECTORS.MESSAGE_ID_ATTR) ||
      `msg-${Date.now()}-${Math.random()}`;

    // Check if already processed
    if (processedMessages.has(messageId)) {
      return null;
    }

    // Extract message content
    const contentElement = messageElement.querySelector(SELECTORS.MESSAGE_CONTENT);
    const content = contentElement?.textContent?.trim() || '';

    if (!content) {
      return null; // Skip empty messages
    }

    // Extract sender
    const senderElement = messageElement.querySelector(SELECTORS.MESSAGE_SENDER);
    const sender = senderElement?.textContent?.trim() || 'Unknown';

    // Extract timestamp
    const timestampElement = messageElement.querySelector(SELECTORS.MESSAGE_TIMESTAMP);
    const timestampAttr = (timestampElement as HTMLTimeElement)?.dateTime;
    const timestamp = timestampAttr || new Date().toISOString();

    // Extract conversation info
    const conversationElement = document.querySelector(SELECTORS.CONVERSATION_NAME);
    const conversationName = conversationElement?.textContent?.trim() || 'Unknown Conversation';

    const conversationIdAttr = document
      .querySelector(`[${SELECTORS.CONVERSATION_ID_ATTR}]`)
      ?.getAttribute(SELECTORS.CONVERSATION_ID_ATTR);
    const conversationId = conversationIdAttr || `conv-${conversationName}`;

    // Determine conversation type (TODO: improve detection)
    // This is a placeholder - needs better detection logic
    const conversationType: 'direct' | 'group' | 'space' = 'group';

    // Determine message type
    let messageType: 'text' | 'image' | 'file' | 'reaction' | 'system' | 'unknown' = 'text';

    if (messageElement.querySelector('img')) {
      messageType = 'image';
    } else if (messageElement.querySelector('[download], .file-attachment')) {
      messageType = 'file';
    }

    // Determine if outgoing (TODO: improve detection)
    // Check for class indicating sent message
    const isOutgoing =
      messageElement.classList.contains('outgoing') ||
      messageElement.closest('.sent-message') !== null;

    const messageData: MessageData = {
      messageId,
      content,
      sender,
      timestamp,
      conversationId,
      conversationName,
      conversationType,
      messageType,
      isOutgoing,
    };

    // Mark as processed
    processedMessages.add(messageId);

    // Cleanup cache (keep last 1000 message IDs)
    if (processedMessages.size > 1000) {
      const idsToRemove = Array.from(processedMessages).slice(0, 100);
      idsToRemove.forEach((id) => processedMessages.delete(id));
    }

    return messageData;
  } catch (error) {
    console.error('[MessageObserver] Failed to extract message data:', error);
    return null;
  }
}

/**
 * Process mutations and extract new messages
 */
function processMutations(mutations: MutationRecord[]): void {
  // Check if message logging is enabled
  // We check this here to avoid processing DOM if feature is disabled
  const config = window.gchat; // Check if API is available
  if (!config) {
    return; // API not ready yet
  }

  for (const mutation of mutations) {
    // Look for added message elements
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      for (const node of mutation.addedNodes) {
        // Skip non-element nodes
        if (!(node instanceof Element)) {
          continue;
        }

        // Check if this is a message element
        // TODO: Update selector after DOM inspection
        const messageElement = node.matches(SELECTORS.MESSAGE_ITEM)
          ? node
          : node.querySelector(SELECTORS.MESSAGE_ITEM);

        if (messageElement) {
          const messageData = extractMessageData(messageElement);

          if (messageData) {
            // Send to main process via contextBridge API
            try {
              window.gchat.sendMessageData(messageData);
              console.debug('[MessageObserver] Message sent:', messageData.messageId);
            } catch (error) {
              console.error('[MessageObserver] Failed to send message:', error);
            }
          }
        }
      }
    }
  }
}

/**
 * Initialize message observer
 */
function initObserver(): void {
  // Clean up existing observer
  if (observer) {
    observer.disconnect();
  }

  console.info('[MessageObserver] Initializing message observer');

  // Wait for message container to be available
  const checkContainer = setInterval(() => {
    const container = document.querySelector(SELECTORS.MESSAGE_CONTAINER);

    if (container) {
      clearInterval(checkContainer);

      // Create observer for message container
      observer = new MutationObserver(processMutations);

      // Observe the message container
      observer.observe(container, {
        childList: true, // Watch for added/removed nodes
        subtree: true, // Watch all descendants
      });

      console.info('[MessageObserver] Observer started, monitoring:', SELECTORS.MESSAGE_CONTAINER);

      // Process existing messages (optional - may duplicate if feature just enabled)
      // Uncomment if you want to capture messages already on screen
      /*
      const existingMessages = container.querySelectorAll(SELECTORS.MESSAGE_ITEM);
      existingMessages.forEach((msg) => {
        const data = extractMessageData(msg);
        if (data) {
          window.gchat.sendMessageData(data);
        }
      });
      */
    }
  }, 1000); // Check every second for container

  // Give up after 30 seconds
  setTimeout(() => {
    clearInterval(checkContainer);
    if (!observer) {
      console.warn('[MessageObserver] Message container not found after 30s, observer not started');
      console.warn('[MessageObserver] Expected selector:', SELECTORS.MESSAGE_CONTAINER);
    }
  }, 30000);
}

/**
 * Cleanup observer
 */
function cleanup(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  processedMessages.clear();
  console.info('[MessageObserver] Observer cleaned up');
}

// Initialize when DOM is ready
window.addEventListener('DOMContentLoaded', initObserver);

// Cleanup on unload
window.addEventListener('beforeunload', cleanup);
