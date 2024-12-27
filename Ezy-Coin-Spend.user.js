// ==UserScript==
// @name        Novel-Ezy-Coin
// @namespace   https://github.com/Salvora
// @version     1.5.1
// @grant       GM_addStyle
// @grant       GM_getResourceText
// @grant       GM_setValue
// @grant       GM_getValue
// @resource    customCSS https://github.com/Salvora/Novel-Ezy-Coin/raw/refs/heads/dev/styles.css?v=1.5.0
// @resource    SETTINGS_HTML https://raw.githubusercontent.com/Salvora/Novel-Ezy-Coin/refs/heads/dev/ezy-coin-settings.html?v=1.0.0
// @resource    siteConfig https://your-server.com/path/to/siteConfig.json?v=1.0.0
// @author      Salvora
// @icon        https://raw.githubusercontent.com/Salvora/Novel-Ezy-Coin/refs/heads/main/Images/coins-solid.png
// @homepageURL https://github.com/Salvora/Novel-Ezy-Coin
// @updateURL   https://github.com/Salvora/Novel-Ezy-Coin/raw/refs/heads/main/Ezy-Coin-Spend.user.js
// @downloadURL https://github.com/Salvora/Novel-Ezy-Coin/raw/refs/heads/main/Ezy-Coin-Spend.user.js
// @supportURL  https://github.com/Salvora/Novel-Ezy-Coin/issues
// @description Userscript to spend your coins to unlock chapters easily
// @match       https://darkstartranslations.com/manga/*
// @match       https://hiraethtranslation.com/novel/*
// @match       https://luminarynovels.com/novel/*
// @license     GPL-3.0-or-later
// @run-at      document-end
// ==/UserScript==

(function () {
  "use strict";
  const processingCoins = new Set(); // Set to track coins being processed
  let balance = null; // Variable to store the balance value
  let totalCost = null; // Variable to store the total cost of all chapters
  let observer; // Define the observer globally
  let autoUnlockSetting = false; // Variable to activate/deactivate the auto unlock functionality from Settings UI
  let balanceLock = false; // Lock to ensure atomic balance updates
  const chapterPageKeywordList = ["chapter", "volume"]; // List of keywords to identify chapter pages
  const concurrencyLimit = 0; // Limit the number of concurrent unlock requests

  // Cache for selectors
  const selectorCache = new Map();
  const SETTINGS = {
    checkboxId: 'auto-unlock-checkbox',
    resourceName: 'SETTINGS_HTML'
  };

  const siteConfig = JSON.parse(GM_getResourceText('siteConfig'));

  // Add debounce utility near top of script after variables
  const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(null, args), delay);
    };
  };
  const debouncedFindAndLinkifyCoins = debounce(findAndLinkifyCoins, 250);


  /**
   * Function to get the appropriate chapter list selector based on the current URL with caching
   * @param {string} url - The URL of the current site
   * @returns {object} The selector for the current site
   */
  function getSelector(url) {
    if (!selectorCache.has(url)) {
      selectorCache.set(url, siteConfig[url]);
    }
    return selectorCache.get(url);
  }

  // /**
  //      * Function to get the appropriate chapter list selector based on the current URL with caching
  //      * @param {string} url - The URL of the current site
  //      * @returns {string} The selector for the current site
  //      */
  // function getSelector(url) {
  //   const siteSelector = {
  //     "https://darkstartranslations.com": {
  //       chapterList: "#manga-chapters-holder",
  //       buttonLocation: "#init-links",
  //       balancePlaceholder: ".c-user_menu li:first-child a",
  //       balanceString: "Balance:",
  //       balanceRegex: /Balance:\s*([\d,]+)/,
  //       coinPage: "https://darkstartranslations.com/user-settings",
  //       coinPlaceholder: ".c-user_menu",
  //       premiumChapterIndicator: ".premium-block .coin",
  //       premiumIndicator: ".premium-block",
  //       noncePlaceholder: "input[name='wp-manga-coin-nonce']",
  //       unlockRequestURL: "https://darkstartranslations.com/wp-admin/admin-ajax.php",
  //       unlockAction: "wp_manga_buy_chapter",
  //     },
  //     "https://luminarynovels.com": {
  //       chapterList: "#manga-chapters-holder",
  //       buttonLocation: "#init-links",
  //       balancePlaceholder: ".c-user_menu li:first-child a",
  //       balanceString: "Balance:",
  //       balanceRegex: /Balance:\s*([\d,]+)/,
  //       coinPage: "https://luminarynovels.com/user-settings",
  //       coinPlaceholder: ".c-user_menu",
  //       premiumChapterIndicator: ".premium-block .coin",
  //       premiumIndicator: ".premium-block",
  //       noncePlaceholder: "input[name='wp-manga-coin-nonce']",
  //       unlockRequestURL: "https://luminarynovels.com/wp-admin/admin-ajax.php",
  //       unlockAction: "wp_manga_buy_chapter",
  //     },
  //     "https://hiraethtranslation.com": {
  //       chapterList: ".page-content-listing.single-page",
  //       buttonLocation: "#init-links",
  //       balancePlaceholder: ".c-user_menu li:first-child a",
  //       balanceString: "Balance:",
  //       balanceRegex: /Balance:\s*([\d,]+)/,
  //       coinPage: "https://hiraethtranslation.com/user-settings",
  //       coinPlaceholder: ".c-user_menu",
  //       premiumChapterIndicator: ".premium-block .coin",
  //       premiumIndicator: ".premium-block",
  //       noncePlaceholder: "input[name='wp-manga-coin-nonce']",
  //       unlockRequestURL: "https://hiraethtranslation.com/wp-admin/admin-ajax.php",
  //       unlockAction: "wp_manga_buy_chapter",
  //     },
  //   };
  //   if (!selectorCache.has(url)) {
  //     selectorCache.set(url, siteSelector[url]);
  //   }
  //   return selectorCache.get(url);
  // }

  // Function to create the settings UI
  function settingsUI() {
    const template = GM_getResourceText(SETTINGS.resourceName);
  
    const container = document.createElement('div');
    container.innerHTML = template;
    document.body.appendChild(container.firstElementChild);
  
    const checkbox = document.getElementById(SETTINGS.checkboxId);
    autoUnlockSetting = GM_getValue('autoUnlock', false); // Initialize the variable
    checkbox.checked = autoUnlockSetting;
  
    checkbox.addEventListener('change', e => {
      autoUnlockSetting = e.target.checked; // Update the variable
      GM_setValue('autoUnlock', autoUnlockSetting);
    });
  }

  /**
   * Validates document structure
   * @param {Document} doc Document to validate
   * @returns {boolean} True if valid
   */
  function isValidDocument(doc) {
    return doc?.querySelector(getSelector(doc.location.origin).coinPlaceholder) !== null;
  }

  /**
   * Parses HTML content and validates document
   * @param {string} content HTML content
   * @returns {Document|null} Parsed document or null
   */
  function parseHTML(content) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');
      return isValidDocument(doc) ? doc : null;
    } catch (error) {
      console.error('Error parsing HTML:', error);
      return null;
    }
  }

  /**
   * Gets the user's balance from document
   * @param {Document} doc Document to search
   * @returns {number} User's balance
   */
  function getBalance(doc) {
    if (!doc || !(doc instanceof Document)) {
      console.error("Invalid document provided");
      return null;
    }

    try {
      const balanceElement = doc.querySelector(getSelector(window.location.origin).balancePlaceholder);
      if (!balanceElement) {
        console.error("Balance element not found");
        return null;
      }

      const balanceText = balanceElement.textContent.trim();
      const balanceMatch = balanceText.match(getSelector(window.location.origin).balanceRegex);
      if (!balanceMatch) {
        console.error("Invalid balance format");
        return null;
      }

      const parsedBalance = parseInt(balanceMatch[1].replace(/,/g, ''), 10);
      return isNaN(parsedBalance) ? null : parsedBalance;
    } catch (error) {
      console.error("Error getting balance:", error);
      return null;
    }
  }

  /**
   * Gets dynamic user balance from user-settings page
   * @returns {Promise<number>} User's current balance
   */
  async function getDynamicBalance() {
    const TIMEOUT_MS = 10000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await sendRequest(
        getSelector(window.location.origin).coinPage,
        { method: 'GET', signal: controller.signal },
        TIMEOUT_MS
      );

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let content = '';

      while (true) {
        const { value, done } = await reader.read();
        
        if (done) {
          const doc = parseHTML(content + decoder.decode());
          return doc ? getBalance(doc) : null;
        }

        content += decoder.decode(value, { stream: true });
        
        if (content.includes(getSelector(window.location.origin).balanceString)) {
          controller.abort();
          const doc = parseHTML(content);
          return doc ? getBalance(doc) : null;
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Request aborted: timeout or balance found');
      } else {
        console.error('Error fetching balance:', error);
      }
      return 0;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Function to update the user's balance
   * @param {number} delta - The amount to subtract from the balance
   */
  async function updateBalance(delta) {
    while (balanceLock) {
      await new Promise(resolve => setTimeout(resolve, 10)); // Wait for the lock to be released
    }
    balanceLock = true; // Acquire the lock
  
    try {
      if (typeof delta !== 'number' || isNaN(delta)) {
        throw new Error('Invalid delta value for balance update');
      }
      balance = Math.max(0, balance - delta); // Prevent negative balance
      const balanceElement = document.querySelector(getSelector(window.location.origin).balancePlaceholder);
      if (balanceElement) {
        console.log('Updating UI with new Balance:', balance);
        const balanceTextNode = balanceElement.childNodes[balanceElement.childNodes.length - 1];
        if (balanceTextNode.nodeType === Node.TEXT_NODE) {
          balanceTextNode.textContent = ` ${balance.toLocaleString()}`;
        } else {
          balanceElement.textContent = ` ${balance.toLocaleString()}`;
        }
      } else {
        console.error('Balance element not found');
      }
    } catch (error) {
      console.error('Error updating balance:', error);
    } finally {
      balanceLock = false; // Release the lock
    }
  }

  /**
   * Function to check if the user has enough balance
   * @param {number} cost - The cost to check against the balance
   * @returns {Promise<boolean>} True if the user has enough balance, false otherwise
   */
  async function checkBalance(cost) {
    try {
      console.log("Checking balance for cost:", cost);
      balance = await getDynamicBalance();
      if (cost > balance) {
        console.error(`Balance: ${balance} is not enough for purchasing the chapter with cost: ${cost} !!!`);
        return false;
      }
      console.log(`Balance: ${balance} is enough for purchasing the chapter(s) with cost: ${cost}`);
      return true;
    } catch (error) {
      console.error("Error checking balance:", error);
      return false;
    }
  }

  /**
   * Function to handle newly added elements and linkify coins
   */
  function findAndLinkifyCoins() {
    try {
      const coinElements = document.querySelectorAll(getSelector(window.location.origin).premiumChapterIndicator);
      console.log(`Found ${coinElements.length} coin elements`);

      coinElements.forEach((coin) => {
        if (!coin.dataset.listenerAdded) {
          coin.addEventListener("click", handleCoinClick);
          coin.classList.add("c-btn-custom-1");
          coin.dataset.listenerAdded = true;
        }
      });

      totalCost = Array.from(coinElements)
        .reduce((total, coin) => total + (parseInt(coin.textContent.replace(/,/g, ''), 10) || 0), 0);

      const unlockAllbutton = document.getElementById("unlock-all-button");
      if (unlockAllbutton) {
        const buttonText = unlockAllbutton.querySelector("span:first-child");
        if (buttonText) {
          buttonText.innerHTML = `Unlock All <i class="fas fa-coins"></i> ${totalCost}`;
        }
      }

      console.log(`Total cost calculated: ${totalCost}`);
    } catch (error) {
      console.error("Error finding and linking coins:", error);
    }
  }

  /**
   * Function to show or hide a spinner on an element
   * @param {HTMLElement} element - The element to show or hide the spinner on
   * @param {boolean} show - Whether to show or hide the spinner
   */
  function elementSpinner(element, show) {
    let spinner = element.querySelector(".spinner");

    if (show) {
      if (!spinner) {
        // Create spinner element if it doesn't exist
        spinner = document.createElement("span");
        spinner.classList.add("spinner");
        spinner.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
        element.appendChild(spinner);
      }
      spinner.classList.add("show"); // Show spinner
    } else {
      if (spinner) {
        spinner.classList.remove("show"); // Hide spinner
        element.removeChild(spinner); // Remove spinner element
      }
    }
  }

  /**
   * Function to handle the click event on a coin
   * @param {Event} event - The click event
   */
  async function handleCoinClick(event) {
    event.preventDefault();
    const coin = event.currentTarget;
    
    if (processingCoins.has(coin)) {
      console.log("Coin is already being processed, ignoring click");
      return;
    }

    processingCoins.add(coin); // Add coin to the set
    coin.disabled = true; // Disable the coin element to prevent multiple clicks
    coin.classList.add("clicked");
    console.log("Coin clicked");

    // Temporarily disconnect the observer
    if (observer) {
      observer.disconnect();
    }

    try {
      setTimeout(() => coin.classList.remove("clicked"), 100);
      const chapterCoinCost = parseInt(coin.textContent.replace(/,/g, ''), 10);
      elementSpinner(coin, true);
      if (!(await checkBalance(chapterCoinCost))) {
        flashCoin(coin);
        return;
      }
      const result = await unlockChapter(coin);
      if (!result) {
        flashCoin(coin);
        console.error(`Failed to unlock chapter for coin: ${coin.textContent}`);
      }
    } catch (error) {
      flashCoin(coin);
      console.error(`Error unlocking chapter for coin: ${coin.textContent}`, error);
    } finally {
      processingCoins.delete(coin); // Remove coin from the set
      coin.disabled = false; // Re-enable the coin element
      elementSpinner(coin, false);
      // Reconnect the observer
      if (observer) {
        const targetDiv = document.querySelector(getSelector(window.location.origin).chapterList);
        if (targetDiv) {
          observer.observe(targetDiv, { childList: true, subtree: true });
        }
      }
    }
  }

  /**
   * Function to flash the coin with fa-times-circle icon
   * @param {HTMLElement} coin - The coin element to flash
   */
  function flashCoin(coin) {
    const originalContent = coin.innerHTML;

    // Replace the content of the coin element with the fa-times-circle icon
    coin.innerHTML = '<i class="fas fa-times-circle"></i>';
    coin.classList.add('flash-red');

    setTimeout(() => {
      coin.classList.remove('flash-red');
      // Restore the original content after the flash effect
      coin.innerHTML = originalContent;
    }, 1000);
  }

  /**
   * Function to unlock a chapter
   * @param {HTMLElement} coin - The coin element
   * @returns {Promise<boolean>} True if the chapter was unlocked successfully, false otherwise
   */
  async function unlockChapter(coin) {
    if (!coin || !(coin instanceof Element)) {
      console.error("Invalid coin element");
      return false;
    }
    const chapterElement = coin.closest(".wp-manga-chapter");
    const chapterIdMatch = chapterElement?.className.match(/data-chapter-(\d+)/);
    const nonceElement = document.querySelector(getSelector(window.location.origin).noncePlaceholder);

    if (!chapterElement || !chapterIdMatch || !nonceElement) {
      console.error("Required element not found");
      coin.disabled = false; // Re-enable the coin element if required elements are not found
      processingCoins.delete(coin); // Remove coin from the set
      return false;
    }

    elementSpinner(coin, true);

    const postData = new URLSearchParams({
      action: getSelector(window.location.origin).unlockAction,
      chapter: chapterIdMatch[1],
      nonce: nonceElement.value,
    });

    try {
      const response = await sendRequest(getSelector(window.location.origin).unlockRequestURL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
        },
        body: postData.toString(),
      });

      if (!response.ok) {
        console.error("Network response was not ok");
        return false;
      }

      const data = await response.json();
      console.log("Successfully sent the request:", data);
      if (data.success && data.data.status) {
        // Update the balance element
        try {
          // Attempt to update the balance
          await updateBalance(parseInt(coin.textContent.replace(/,/g, ''), 10));
        } catch (error) {
          console.error('Error calling updateBalance:', error);
        }

        // Remove the premium-block class from the chapter element
        chapterElement.classList.remove(getSelector(window.location.origin).premiumIndicator);

        // Remove the c-btn-custom-1 class from the coin element
        coin.classList.remove("c-btn-custom-1");

        // Update the href attribute of the <a> element with the URL from the response
        const linkElement = chapterElement.querySelector('a');
        if (linkElement) {
          linkElement.href = data.data.url;

          // Update the icon class from fas fa-lock to fas fa-lock-open
          const iconElement = linkElement.querySelector('i.fas.fa-lock');
          if (iconElement) {
            iconElement.classList.remove('fa-lock');
            iconElement.classList.add('fa-lock-open');
          }

          // Clone the <a> element to remove all event listeners
          const newLinkElement = linkElement.cloneNode(true);
          linkElement.parentNode.replaceChild(newLinkElement, linkElement);
        }

        // Remove the event listener after success
        coin.removeEventListener('click', handleCoinClick);

        // Call findAndLinkifyCoins to update the total cost and button text
        debouncedFindAndLinkifyCoins();
        return true;
      } else {
        console.error("Failed to buy chapter:", data.data.message);
        coin.disabled = false; // Re-enable the coin element if the request fails
        return false;
      }

    } catch (error) {
      console.error("Error:", error);
      coin.disabled = false; // Re-enable the coin element if an error occurs
      return false;
    } finally {
      processingCoins.delete(coin); // Remove coin from the set
      elementSpinner(coin, false);
    }
  }

  /**
   * Send HTTP request with timeout
   * @param {string} url - The URL to send the request to
   * @param {Object} options - Request options
   * @param {number} [timeout=10000] - Timeout in milliseconds
   * @returns {Promise<Response>} Fetch response
   */
  async function sendRequest(url, options = {}, timeout = 10000) {
    const { signal, ...fetchOptions } = options;

    return Promise.race([
      fetch(url, { ...fetchOptions, signal }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out')), timeout)
      )
    ]);
  }

  /**
   * Function to create the "Unlock All" button
   */
  function createUnlockAllButton() {
    try {
      const targetElement = document.querySelector(getSelector(window.location.origin).buttonLocation);
      if (targetElement) {
        const button = document.createElement("button");
        button.id = "unlock-all-button"; // Assign an ID
        button.classList.add("c-btn", "c-btn_style-1", "nav-links");

        // Create a span element for the button text
        const buttonText = document.createElement("span");
        buttonText.innerHTML = `Unlock All <i class="fas fa-coins"></i> ${totalCost}`;

        button.appendChild(buttonText);
        elementSpinner(button, false);
        targetElement.appendChild(button);
        console.log("Button inserted successfully");

        // Function to update button content dynamically
        const updateButtonContent = () => {
          buttonText.innerHTML = `Unlock All <i class="fas fa-coins"></i> ${totalCost}`;
        };

        button.addEventListener("click", async () => {
          const originalWidth = button.offsetWidth; // Save original button width
          button.style.width = `${originalWidth}px`; // Set button width to its original width
          buttonText.style.display = "none"; // Hide button text
          elementSpinner(button, true); // Show spinner
          button.disabled = true; // Disable the button

          try {
            await unlockAllChapters();
          } catch (error) {
            console.error("Error unlocking all chapters:", error);
          } finally {
            elementSpinner(button, false); // Hide spinner
            updateButtonContent(); // Restore original button content dynamically
            buttonText.style.display = "inline"; // Show button text
            button.style.width = 'auto'; // Reset button width to auto
            button.disabled = false; // Re-enable the button
          }
        });
      } else {
        console.error("Target element for button not found");
      }
    } catch (error) {
      console.error("Error creating unlock all button:", error);
    }
  }

  /**
   * Function to limit concurrency of tasks
   * @param {number} limit - The concurrency limit
   * @param {Array<Function>} tasks - The tasks to execute
   * @returns {Promise<Array>} The results of the tasks
   */
  async function withConcurrencyLimit(limit, tasks) {
    if (limit === 0) {
      // If limit is 0, execute all tasks at once
      const promises = tasks.map(task => task());
      return Promise.all(promises);
    }

    const results = [];
    const executing = [];

    for (const task of tasks) {
      const p = task();
      results.push(p);

      if (executing.length >= limit) {
        await Promise.race(executing);
      }

      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
    }

    return Promise.all(results);
  }

  /**
   * Function to unlock all chapters
   */
  async function unlockAllChapters() {
    try {
      if (!(await checkBalance(totalCost))) {
        alert(`Balance (${balance}) is not enough to unlock all chapters! (${totalCost})`);
        return;
      }
      if (totalCost === 0) {
        return;
      }
      const userConfirmed = confirm(
        `You are about to spend ${totalCost} coins to unlock all chapters.
      Current Balance: ${balance}
      Calculated New Balance: ${balance - totalCost}
      Do you want to proceed?`
      );

      if (!userConfirmed) {
        return;
      }

      const coinElements = Array.from(document.querySelectorAll(getSelector(window.location.origin).premiumChapterIndicator)).reverse();
      

      await withConcurrencyLimit(concurrencyLimit, coinElements.map(coin => async () => {
        try {
          const result = await unlockChapter(coin);
          if (!result) {
            flashCoin(coin);
            console.error(`Failed to unlock chapter for coin: ${coin.textContent}`);
          }
        } catch (error) {
          flashCoin(coin);
          console.error(`Error unlocking chapter for coin: ${coin.textContent}`, error);
        } finally {
          processingCoins.delete(coin); // Ensure coin is removed from the set
        }
      }));
      console.log("All chapters have been processed!");
    } catch (error) {
      console.error("Error processing chapters:", error);
      alert("An error occurred while processing chapters. Please try again.");
    }
  }

  /**
   * Function to auto unlock chapters
   * To Do
   * check if it is the last chapter
   * find the current chapter and check for next chapter
   * check if the next chapter is locked
   * unlock the next chapter if locked
   */
  function autoUnlockChapters() {
    const chapterList = document.getElementById("manga-reading-nav-head");
    const selectElement = document.querySelector(".c-selectpicker.selectpicker_chapter.selectpicker.single-chapter-select");

    const nextButton = document.getElementById("manga-reading-nav-foot")?.querySelector(".nav-next");
    
    const chapterElement = nextButton.closest(".wp-manga-chapter");
    const chapterIdMatch = chapterElement?.className.match(/data-chapter-(\d+)/);
    const nonceElement = document.querySelector(getSelector(window.location.origin).noncePlaceholder);

    const postData = new URLSearchParams({
      action: getSelector(window.location.origin).unlockAction,
      chapter: chapterIdMatch[1],
      nonce: nonceElement.value,
    });

    if (!chapterList || !nextButton || !selectElement) {
      console.error("Required elements for auto unlock not found");
      return false;
    }
  
    const currentChapter = chapterList.querySelector("ol li.active");
    if (!currentChapter) {
      console.error("Current chapter element not found");
      return false;
    }
  
    // Implementation continues here...
    return true;
  }

  /**
   * Main initialization function
   */
  function init() {
    try {
      balance = getBalance(document);
      if (balance === null) {
        console.error("Balance not found (Maybe not logged in?), stopping the script");
        return;
      }
      GM_addStyle(GM_getResourceText("customCSS"));
      const isChapterPage = chapterPageKeywordList.some(keyword => window.location.pathname.includes(`/${keyword}`));
      if (!isChapterPage) {
        totalCost = 0;
        createUnlockAllButton();
        observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.addedNodes.length || mutation.removedNodes.length) {
              debouncedFindAndLinkifyCoins();
              break;
            }
          }
        });

        // Add cleanup listener right after observer creation
        window.addEventListener('unload', () => {
          if (observer) {
            observer.disconnect();
            observer = null;
          }

        });
        const targetDiv = document.querySelector(getSelector(window.location.origin).chapterList);
        if (targetDiv) {
          debouncedFindAndLinkifyCoins();
          observer.observe(targetDiv, { childList: true, subtree: true });
        } else {
          console.error("Target div not found");
        }
      } else {
        console.log("Coin unlocking is not running on a chapter page");
      }
    } catch (error) {
      console.error("Error during initialization:", error);
    } finally {
      try {
        console.log("Creating UI for settings");
        settingsUI();
      } catch (error) {
        console.error("Error creating Settings UI block:", error);
      }
    }
  }

  // Call the init function to start the script
  init();
})();