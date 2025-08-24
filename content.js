class ChzzkStreamerBlocker {
  constructor() {
    this.masterEnabled = true;
    this.streamerEnabled = true; 
    this.tagEnabled = true;
    this.blockedStreamers = [];
    this.blockedTags = [];
    this.observer = null;
    this.debugMode = true; // Enable debug logging
    this.init();
  }

  log(...args) {
    if (this.debugMode) {
      console.log('[CHZZK Blocker]', ...args);
    }
  }

  async init() {
    this.log('Initializing CHZZK Blocker...');
    await this.loadSettings();
    this.setupMessageListener();
    this.setupContextMenu();
    this.startBlocking();
  }

  async loadSettings() {
    try {
      const data = await chrome.storage.sync.get([
        'masterBlockEnabled',
        'streamerBlockEnabled', 
        'tagBlockEnabled',
        'blockedStreamers',
        'blockedTags'
      ]);
      
      this.masterEnabled = data.masterBlockEnabled !== false;
      this.streamerEnabled = data.streamerBlockEnabled !== false;
      this.tagEnabled = data.tagBlockEnabled !== false;
      this.blockedStreamers = data.blockedStreamers || [];
      this.blockedTags = data.blockedTags || [];
      
      this.log('Settings loaded:', { 
        masterEnabled: this.masterEnabled,
        streamerEnabled: this.streamerEnabled, 
        tagEnabled: this.tagEnabled,
        blockedStreamers: this.blockedStreamers, 
        blockedTags: this.blockedTags 
      });
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'updateBlockSettings') {
        this.masterEnabled = message.settings.masterEnabled;
        this.streamerEnabled = message.settings.streamerEnabled;
        this.tagEnabled = message.settings.tagEnabled;
        this.blockedStreamers = message.settings.blockedStreamers;
        this.blockedTags = message.settings.blockedTags;
        this.applyBlocking();
      } else if (message.action === 'updateBlockList') {
        // SOOP 스타일 메시지 호환성
        if (message.blockedStreamers) this.blockedStreamers = message.blockedStreamers;
        if (message.blockedTags) this.blockedTags = message.blockedTags;
        this.applyBlocking();
      }
    });
  }

  startBlocking() {
    this.applyBlocking();
    this.setupObserver();
    this.setupPeriodicCheck();
  }

  setupPeriodicCheck() {
    // Check every 2 seconds for new content
    setInterval(() => {
      const totalBlocked = this.blockedStreamers.length + this.blockedTags.length;
      if (this.masterEnabled && totalBlocked > 0) {
        this.log('Periodic check - reapplying blocking...');
        this.applyBlocking();
      }
      // Always add context menu to new cards
      this.addContextMenuToCards();
    }, 2000);

    // Also check on scroll and other events
    ['scroll', 'resize', 'focus'].forEach(event => {
      window.addEventListener(event, () => {
        const totalBlocked = this.blockedStreamers.length + this.blockedTags.length;
        if (this.masterEnabled && totalBlocked > 0) {
          setTimeout(() => this.applyBlocking(), 100);
        }
      }, { passive: true });
    });

    this.log('Periodic checks set up');
  }

  setupObserver() {
    if (this.observer) {
      this.observer.disconnect();
    }

    this.observer = new MutationObserver((mutations) => {
      let shouldReapply = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (let node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check for stream card elements with more comprehensive selectors
              const streamCardSelectors = [
                '.navigation_component_item__iMPOI',
                '.video_card_container__urjO6',
                '[class*="video_card_container"]',
                '[class*="navigation_component_item"]',
                '[class*="live_card"]',
                '[class*="stream_card"]',
                '[class*="card"]',
                '[class*="item"]'
              ];
              
              const isStreamCard = streamCardSelectors.some(selector => 
                node.matches?.(selector) || node.querySelector?.(selector)
              );
              
              if (isStreamCard) {
                this.log('New stream card detected, reapplying blocking...');
                shouldReapply = true;
                // Add context menu to new cards
                setTimeout(() => this.addContextMenuToCards(), 100);
                break;
              }
            }
          }
        }
      });

      if (shouldReapply) {
        setTimeout(() => this.applyBlocking(), 300); // Slight delay to ensure DOM is ready
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    this.log('DOM observer set up');
  }

  isStreamCard(element) {
    const cardSelectors = [
      '.navigation_component_item__iMPOI',
      '.live_card_item',
      '[class*="card"]',
      '[class*="item"]'
    ];
    
    return cardSelectors.some(selector => 
      element.matches?.(selector) || element.querySelector?.(selector)
    );
  }

  applyBlocking() {
    const totalBlocked = this.blockedStreamers.length + this.blockedTags.length;
    this.log('Applying blocking...', { 
      masterEnabled: this.masterEnabled, 
      streamerEnabled: this.streamerEnabled,
      tagEnabled: this.tagEnabled,
      totalBlocked: totalBlocked 
    });
    
    if (!this.masterEnabled || totalBlocked === 0) {
      this.log('Blocking disabled or no blocked items, showing all cards');
      this.showAllStreamCards();
      return;
    }

    const streamCards = this.findStreamCards();
    this.log('Processing stream cards...', streamCards.length);
    
    let hiddenCount = 0;
    streamCards.forEach((card, index) => {
      const shouldHide = this.shouldHideCard(card);
      this.setCardVisibility(card, !shouldHide);
      if (shouldHide) hiddenCount++;
      
      this.log(`Card ${index + 1}/${streamCards.length}: ${shouldHide ? 'HIDDEN' : 'VISIBLE'}`);
    });
    
    this.log(`Blocking applied: ${hiddenCount}/${streamCards.length} cards hidden`);
  }

  findStreamCards() {
    // More comprehensive selectors based on the provided HTML structure
    const selectors = [
      '.navigation_component_item__iMPOI', // Original selector from example
      'li.navigation_component_item__iMPOI', // More specific
      '.video_card_container__urjO6', // Container class from example  
      '[class*="video_card_container"]',
      '[class*="navigation_component_item"]',
      '[class*="live_card"]',
      '[class*="stream_card"]',
      // Fallback selectors
      'li[class*="item"]',
      'div[class*="card"]',
      'article[class*="card"]'
    ];

    const cards = [];
    selectors.forEach(selector => {
      const foundCards = document.querySelectorAll(selector);
      if (foundCards.length > 0) {
        this.log(`Found ${foundCards.length} cards with selector: ${selector}`);
        cards.push(...foundCards);
      }
    });

    const uniqueCards = [...new Set(cards)];
    this.log(`Total unique stream cards found: ${uniqueCards.length}`);
    
    return uniqueCards;
  }

  shouldHideCard(card) {
    const streamerInfo = this.extractStreamerInfo(card);
    
    // 스트리머 차단 검사
    if (this.streamerEnabled && this.blockedStreamers.length > 0) {
      const streamerMatch = this.blockedStreamers.some(blockedStreamer => {
        const matches = this.matchesStreamer(streamerInfo, blockedStreamer);
        if (matches) {
          this.log(`MATCH! Streamer "${blockedStreamer}" matches: ${streamerInfo.name}`);
        }
        return matches;
      });
      
      if (streamerMatch) return true;
    }
    
    // 태그 차단 검사  
    if (this.tagEnabled && this.blockedTags.length > 0) {
      const tagMatch = this.blockedTags.some(blockedTag => {
        const matches = this.matchesTag(streamerInfo, blockedTag);
        if (matches) {
          this.log(`MATCH! Tag "${blockedTag}" matches in: ${streamerInfo.title || streamerInfo.tags.join(', ')}`);
        }
        return matches;
      });
      
      if (tagMatch) return true;
    }
    
    return false;
  }

  extractStreamerInfo(card) {
    const info = {
      name: '',
      title: '',
      tags: []
    };

    // First try to find the specific name_text class for more accurate extraction
    const nameTextElement = card.querySelector('[class*="name_text"]');
    if (nameTextElement) {
      const nameText = nameTextElement.textContent?.trim() || '';
      if (nameText && nameText.length > 0 && nameText.length < 50) {
        info.name = nameText;
        this.log(`Found streamer name from name_text: "${info.name}"`);
      }
    }

    // If no name found, use the fallback method but with better filtering
    if (!info.name) {
      const allElements = card.querySelectorAll('*');
      
      for (let element of allElements) {
        const classList = element.classList;
        const textContent = element.textContent?.trim() || '';
        
        if (!textContent) continue;
        
        // Look for streamer name in channel-related classes
        if (this.hasClassContaining(classList, 'channel') || 
            this.hasClassContaining(classList, 'name') ||
            this.hasClassContaining(classList, 'ellipsis')) {
          
          const cleanName = textContent
            .replace(/채널로 이동|channel|live|LIVE|라이브|인증 마크|스트리머|채널|방송/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
            
          if (cleanName && cleanName.length > 0 && cleanName.length < 50 && !info.name) {
            info.name = cleanName;
            this.log(`Found streamer name: "${info.name}"`);
          }
        }
      }
    }

    // Extract title and tags from all elements
    const allElements = card.querySelectorAll('*');
    for (let element of allElements) {
      const classList = element.classList;
      const textContent = element.textContent?.trim() || '';
      
      if (!textContent) continue;
      
      // Look for stream title
      if (this.hasClassContaining(classList, 'title')) {
        const cleanTitle = textContent
          .replace(/라이브 엔드로 이동|live|stream|LIVE|라이브/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
          
        if (cleanTitle && cleanTitle.length > 0 && !info.title) {
          info.title = cleanTitle;
          this.log(`Found stream title: "${info.title}"`);
        }
      }
      
      // Look for tags
      if (this.hasClassContaining(classList, 'tag') || 
          this.hasClassContaining(classList, 'category') ||
          this.hasClassContaining(classList, 'genre')) {
        
        if (textContent.length > 0 && textContent.length < 20 && !info.tags.includes(textContent)) {
          info.tags.push(textContent);
        }
      }
    }

    // Extract additional tags from title
    if (info.title) {
      const titleWords = info.title.split(/[\s,\[\]()]+/).filter(word => 
        word.length > 1 && word.length < 10 &&
        !/^(the|and|or|in|on|at|to|for|of|with|by|그|이|을|를|의|에|는|가|한|수)$/i.test(word)
      );
      titleWords.forEach(word => {
        if (!info.tags.includes(word)) {
          info.tags.push(word);
        }
      });
    }

    // Fallback: try to find any Korean or English name in the card
    if (!info.name) {
      const allText = card.textContent || '';
      const koreanMatch = allText.match(/[가-힣]{2,8}/);
      const englishMatch = allText.match(/[A-Za-z]{3,15}/);
      
      if (koreanMatch) {
        const candidate = koreanMatch[0];
        // Exclude common words
        if (!['라이브', '채널', '이동', '방송', '스트림'].includes(candidate)) {
          info.name = candidate;
        }
      } else if (englishMatch) {
        const candidate = englishMatch[0];
        if (!['LIVE', 'live', 'channel', 'stream'].includes(candidate)) {
          info.name = candidate;
        }
      }
    }

    this.log('Extracted info:', info);
    return info;
  }

  hasClassContaining(classList, substring) {
    for (let className of classList) {
      if (className.toLowerCase().includes(substring.toLowerCase())) {
        return true;
      }
    }
    return false;
  }

  matchesStreamer(streamerInfo, blockedName) {
    const cleanBlockedName = blockedName.toLowerCase().trim();
    const cleanStreamerName = streamerInfo.name.toLowerCase().trim();
    
    return cleanStreamerName.includes(cleanBlockedName) || 
           cleanBlockedName.includes(cleanStreamerName) ||
           streamerInfo.title.toLowerCase().includes(cleanBlockedName);
  }

  matchesTag(streamerInfo, blockedTag) {
    const cleanBlockedTag = blockedTag.toLowerCase().trim();
    
    return streamerInfo.tags.some(tag => 
      tag.toLowerCase().includes(cleanBlockedTag) || 
      cleanBlockedTag.includes(tag.toLowerCase())
    ) || streamerInfo.title.toLowerCase().includes(cleanBlockedTag);
  }

  setCardVisibility(card, visible) {
    // Mark card as processed for debugging
    card.classList.add('chzzk-blocker-processed');
    
    if (visible) {
      card.style.removeProperty('display');
      card.style.removeProperty('visibility');
      card.style.removeProperty('opacity');
      card.style.removeProperty('height');
      card.style.removeProperty('width');
      card.style.removeProperty('position');
      card.style.removeProperty('left');
      card.style.removeProperty('top');
      card.classList.remove('chzzk-blocker-hidden');
      this.log('Card made VISIBLE');
    } else {
      // Apply multiple hiding methods
      card.style.display = 'none';
      card.style.visibility = 'hidden';
      card.style.opacity = '0';
      card.style.height = '0px';
      card.style.width = '0px';
      card.style.position = 'absolute';
      card.style.left = '-9999px';
      card.style.top = '-9999px';
      card.classList.add('chzzk-blocker-hidden');
      this.log('Card made HIDDEN');
    }
  }

  showAllStreamCards() {
    const hiddenCards = document.querySelectorAll('.chzzk-blocker-hidden');
    hiddenCards.forEach(card => {
      card.style.removeProperty('display');
      card.classList.remove('chzzk-blocker-hidden');
    });
  }

  setupContextMenu() {
    this.log('Setting up context menu...');
    
    // Create context menu element
    this.contextMenu = document.createElement('div');
    this.contextMenu.id = 'chzzk-blocker-context-menu';
    this.contextMenu.innerHTML = `
      <div class="chzzk-context-menu-item" id="chzzk-block-streamer">
        🚫 이 스트리머 숨기기
      </div>
    `;
    this.contextMenu.style.cssText = `
      position: fixed;
      background: #2a2a2a;
      border: 1px solid #555;
      border-radius: 6px;
      padding: 8px 0;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      color: white;
      min-width: 180px;
      display: none;
    `;
    
    // Style for menu items
    const style = document.createElement('style');
    style.textContent = `
      .chzzk-context-menu-item {
        padding: 8px 16px;
        cursor: pointer;
        transition: background-color 0.15s ease;
      }
      .chzzk-context-menu-item:hover {
        background-color: #404040;
      }
      .chzzk-context-menu-item:active {
        background-color: #555;
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(this.contextMenu);

    // Store current target for context menu
    this.currentContextTarget = null;

    // Add context menu to existing stream cards
    this.addContextMenuToCards();

    // Hide context menu on click elsewhere
    document.addEventListener('click', (e) => {
      if (!this.contextMenu.contains(e.target)) {
        this.hideContextMenu();
      }
    });

    // Add click handler for context menu items
    this.contextMenu.addEventListener('click', (e) => {
      if (e.target.id === 'chzzk-block-streamer') {
        this.blockStreamerFromContext();
      }
      this.hideContextMenu();
    });

    this.log('Context menu setup complete');
  }

  addContextMenuToCards() {
    const streamCards = this.findStreamCards();
    this.log(`Adding context menu to ${streamCards.length} stream cards`);
    
    streamCards.forEach(card => {
      if (!card.hasAttribute('data-chzzk-context-menu')) {
        card.setAttribute('data-chzzk-context-menu', 'true');
        
        card.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          this.showContextMenu(e, card);
          return false;
        }, true);
        
        this.log('Added context menu to stream card');
      }
    });
  }

  showContextMenu(event, streamCard) {
    this.currentContextTarget = streamCard;
    
    this.contextMenu.style.display = 'block';
    this.contextMenu.style.left = event.pageX + 'px';
    this.contextMenu.style.top = event.pageY + 'px';
    
    // Adjust position if menu would go off-screen
    const rect = this.contextMenu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    if (rect.right > viewportWidth) {
      this.contextMenu.style.left = (event.pageX - rect.width) + 'px';
    }
    
    if (rect.bottom > viewportHeight) {
      this.contextMenu.style.top = (event.pageY - rect.height) + 'px';
    }

    this.log('Context menu shown for stream card');
  }

  hideContextMenu() {
    if (this.contextMenu) {
      this.contextMenu.style.display = 'none';
    }
    this.currentContextTarget = null;
  }

  async blockStreamerFromContext() {
    if (!this.currentContextTarget) {
      this.log('No target stream card for blocking');
      return;
    }

    const streamerInfo = this.extractStreamerInfo(this.currentContextTarget);
    
    if (!streamerInfo.name) {
      this.log('Could not extract streamer name from card');
      return;
    }

    this.log(`Adding "${streamerInfo.name}" to blocked streamers`);
    
    // Add to blocked streamers list
    if (!this.blockedStreamers.includes(streamerInfo.name)) {
      this.blockedStreamers.push(streamerInfo.name);
      
      // Save to storage
      try {
        await chrome.storage.sync.set({
          blockedStreamers: this.blockedStreamers
        });
        this.log(`Successfully blocked streamer: ${streamerInfo.name}`);
        
        // Reapply blocking to hide the newly blocked streamer
        this.applyBlocking();
        
        // Show notification (optional)
        this.showNotification(`"${streamerInfo.name}" 스트리머가 숨겨졌습니다.`);
        
      } catch (error) {
        console.error('Failed to save blocked streamer:', error);
      }
    } else {
      this.log(`Streamer "${streamerInfo.name}" is already blocked`);
    }
  }

  showNotification(message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4a4a4a;
      color: white;
      padding: 12px 20px;
      border-radius: 6px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      z-index: 10001;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Fade in
    setTimeout(() => {
      notification.style.opacity = '1';
    }, 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ChzzkStreamerBlocker();
  });
} else {
  new ChzzkStreamerBlocker();
}