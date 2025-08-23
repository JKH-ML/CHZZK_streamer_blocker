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

    // Safe approach - find elements by checking class names directly
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
          .replace(/채널로 이동|channel|live|LIVE|라이브/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
          
        if (cleanName && cleanName.length > 0 && cleanName.length < 50 && !info.name) {
          info.name = cleanName;
          this.log(`Found streamer name: "${info.name}"`);
        }
      }
      
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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ChzzkStreamerBlocker();
  });
} else {
  new ChzzkStreamerBlocker();
}