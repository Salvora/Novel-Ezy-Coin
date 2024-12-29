// ==UserScript==
// @name        Novel-Ezy-Coin
// @namespace   https://github.com/Salvora
// @version     1.6.7
// @grant       GM_addStyle
// @grant       GM_getResourceText
// @grant       GM_setValue
// @grant       GM_getValue
// @resource    customCSS https://github.com/Salvora/Novel-Ezy-Coin/raw/refs/heads/main/styles.css?v=1.6.9#sha256=bde2db910198b249808ca784af346d864713b5f9a7a46445d51c716598e500df
// @resource    SETTINGS_HTML https://github.com/Salvora/Novel-Ezy-Coin/raw/refs/heads/main/ezy-coin-settings.html?v=1.0.2#sha256=2784e6334415a4b53711b4cf13175f66db1d75711b7176b6d68aba0d1e1cd964
// @resource    siteConfig https://github.com/Salvora/Novel-Ezy-Coin/raw/refs/heads/main/siteConfig.json?v=1.0.8#sha256=fc1090f795b62fd6bd022c111d4d74b1de67bf50e1e91de612beb79ad131d8b3
// @author      Salvora
// @icon        https://raw.githubusercontent.com/Salvora/Novel-Ezy-Coin/refs/heads/main/Images/coins-solid.png#sha256=493177e879b9f946174356a0ed957ff36682d83ff5a94040cd274d2cbeefd77b
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
  let autoUnlockSetting = GM_getValue(`autoUnlock_${window.location.hostname}`, false); // Initialize the variable from settings
  let balanceLock = false; // Lock to ensure atomic balance updates
  const chapterPageKeywordList = ["chapter", "volume"]; // List of keywords to identify chapter pages
  let concurrencyLimit = 1; // Limit the number of concurrent unlock requests
  let enableChapterLog = false; // Enable logging of chapter details

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

  /**
   * Function to create the settings UI
   */
  function settingsUI() {
    const template = GM_getResourceText(SETTINGS.resourceName);

    const container = document.createElement('div');
    container.innerHTML = template;
    document.body.appendChild(container.firstElementChild);

    const checkbox = document.getElementById(SETTINGS.checkboxId);
    checkbox.checked = autoUnlockSetting;

    checkbox.addEventListener('change', async (e) => {
        autoUnlockSetting = e.target.checked; // Update the variable
        GM_setValue(`autoUnlock_${window.location.hostname}`, autoUnlockSetting);
        console.log(`Auto Unlock setting changed to: ${autoUnlockSetting}`);

        // Determine if the current page is a chapter page
        const isChapterPage = chapterPageKeywordList.some(keyword => window.location.pathname.includes(`/${keyword}`));

        if (autoUnlockSetting && isChapterPage) {
            console.log("Auto Unlock enabled on a chapter page. Initiating auto unlock...");
            await autoUnlockChapters();
        } else if (!autoUnlockSetting && isChapterPage) {
            console.log("Auto Unlock disabled.");
        }
    });
  }


  /**
   * Function to add or remove a coin from processingCoins
   * @param {HTMLElement} coin - The coin element
   * @param {string} action - `'add'` to add the coin, `'delete'` to remove it
   */
  function setProcessingCoin(coin, action) {
    if (action === 'add') {
      if (!processingCoins.has(coin)) {
        processingCoins.add(coin);
        console.log("Coin added to processingCoins");
      } else {
        console.warn("Coin is already in processingCoins");
      }
    } else if (action === 'delete') {
      if (processingCoins.has(coin)) {
        processingCoins.delete(coin);
        console.log("Coin removed from processingCoins");
      } else {
        console.warn("Coin was not found in processingCoins");
      }
    } else {
      console.error("Invalid action. Use 'add' or 'delete'.");
    }
  }

  /**
   * Function to enable or disable the button both functionally and visually
   * @param {HTMLElement} button - The button element
   * @param {string} action - `'enable'` to enable, `'disable'` to disable
   */
  function setButtonState(button, action) {
    if (action === 'disable') {
      button.disabled = true; // Disable the button functionality
      button.classList.add('disabled'); // Apply the 'disabled' visual style
      console.log("Button disabled (functionally and visually).");
    } else if (action === 'enable') {
      button.disabled = false; // Enable the button functionality
      button.classList.remove('disabled');// Remove the 'disabled' visual style
      console.log(`Button enabled (functionally and visually).`);
    } else {
      console.error(`Invalid action "${action}" provided to setButtonState. Use 'enable' or 'disable'.`);
    }
  }

  /**
   * Validates document structure
   * @param {Document} doc Document to validate
   * @param {string} url The URL of the current site
   * @returns {boolean} True if valid
   */
  function isValidDocument(doc, url) {
    return doc?.querySelector(getSelector(url).coinPlaceholder) !== null;
  }

  /**
   * Parses HTML content and validates document
   * @param {string} content HTML content
   * @param {string} url The URL of the current site
   * @returns {Document|null} Parsed document or null
   */
  function parseHTML(content, url) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');
      return isValidDocument(doc, url) ? doc : null;
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
      const pattern = new RegExp(getSelector(window.location.origin).balanceRegex);
      const balanceMatch = balanceText.match(pattern);
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
    const coinPage = getSelector(window.location.origin).coinPage;
    const coinPageBaseURL = new URL(coinPage).origin;

    try {
      const response = await sendRequest(
        coinPage,
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
          const doc = parseHTML(content + decoder.decode(), coinPageBaseURL);
          return doc ? getBalance(doc) : null;
        }

        content += decoder.decode(value, { stream: true });

        if (content.includes(getSelector(window.location.origin).balanceString)) {
          controller.abort();
          const doc = parseHTML(content, coinPageBaseURL);
          return doc ? getBalance(doc) : null;
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Request aborted: timeout or balance not found');
      } else {
        console.error('Error fetching balance:', error);
      }
      return null;
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

      if (balance === null) {
        console.error("Failed to retrieve balance. Balance is null.");
        return false;
      }

      if (cost > balance) {
        console.error(`Balance (${balance.toLocaleString()}) is not enough for purchasing the chapter with cost: ${cost.toLocaleString()} !!!`);
        return false;
      }

      console.log(`Balance (${balance.toLocaleString()}) is sufficient for purchasing the chapter(s) with cost: ${cost.toLocaleString()}`);
      return true;
    } catch (error) {
      console.error("Error checking balance:", error);
      return false; // Return false to indicate insufficient balance or error
    }
  }

  /**
   * Extracts the coin cost from an element.
   * Handles both textContent and class-based indicators.
   *
   * @param {HTMLElement} element - The element containing the coin cost.
   * @returns {number|null} The extracted coin cost or null if not found.
   */
  function getCoinCost(element) {
    if (!element || !(element instanceof HTMLElement)) {
        console.error("Invalid element provided to getCoinCost.");
        return null;
    }

    // 1. Attempt to extract from textContent
    const rawText = element.textContent.replace(/,/g, '').trim();
    let coinCost = parseInt(rawText, 10);

    if (!isNaN(coinCost)) {
        return coinCost;
    }

    // 2. Attempt to extract from class names (e.g., 'coin-6')
    const coinClass = Array.from(element.classList).find(cls => cls.startsWith('coin-'));

    if (coinClass) {
        const parts = coinClass.split('-');
        if (parts.length >= 2) {
            const coinNumber = parseInt(parts[1], 10);
            if (!isNaN(coinNumber)) {
                return coinNumber;
            }
        }
    }

    // 3. Optionally, handle data attributes if available
    // Example: <span data-coin-cost="6">...</span>
    if (element.dataset && element.dataset.coinCost) {
        const dataCoinCost = parseInt(element.dataset.coinCost, 10);
        if (!isNaN(dataCoinCost)) {
            return dataCoinCost;
        }
    }

    // Unable to find coin cost
    console.error("Unable to extract coin cost from element:", element);
    return null;
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

      const unlockAllButton = document.getElementById("unlock-all-button");
      if (unlockAllButton && unlockAllButton.updateContent) {
        unlockAllButton.updateContent();
      }

      console.log(`Total cost calculated: ${totalCost}`);
      if (enableChapterLog) {
        logDetails(coinElements);
      }
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
      console.log('elementSpinner: Spinner shown');
    } else {
      if (spinner) {
        spinner.classList.remove("show"); // Hide spinner
        element.removeChild(spinner); // Remove spinner element
        console.log('elementSpinner: Spinner hidden and removed');
      } else {
        console.warn('elementSpinner: Spinner element not found');
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

    setProcessingCoin(coin, 'add'); // Add coin to the set
    setButtonState(coin, 'disable'); // Disable the button
    coin.classList.add("clicked");
    console.log("Coin clicked");
    elementSpinner(coin, true);

    // Temporarily disconnect the observer
    if (observer) {
      observer.disconnect();
    }

    try {
      setTimeout(() => coin.classList.remove("clicked"), 100);
      const chapterCoinCost = parseInt(coin.textContent.replace(/,/g, ''), 10);
      if (!(await checkBalance(chapterCoinCost))) {
        await flashCoin(coin, false);
        setButtonState(coin, 'enable'); // Re-enable the coin element
        return;
      }
      const result = await unlockChapter(coin, 'series-page');
      if (!result) {
        await flashCoin(coin, false);
        setButtonState(coin, 'enable'); // Re-enable the coin element
        console.error(`Failed to unlock chapter for coin: ${coin.textContent}`);
        return;
      }
    } catch (error) {
      await flashCoin(coin, false);
      setButtonState(coin, 'enable'); // Re-enable the coin element
      console.error(`Error unlocking chapter for coin: ${coin.textContent}`, error);
      return;
    } finally {
      setProcessingCoin(coin, 'delete'); // Remove coin from the set
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
   * Function to flash the coin with an icon
   * @param {HTMLElement} coin - The coin element to flash
   * @param {boolean} isSuccess - Whether to flash green for success or red for failure
   * @returns {Promise} - Resolves after the flash effect is complete
   */
  async function flashCoin(coin, isSuccess) {
    const originalContent = coin.innerHTML;

    // Determine the icon and class based on success or failure
    const iconClass = isSuccess ? 'fas fa-check-circle flash-icon' : 'fas fa-times-circle flash-icon';
    const flashClass = isSuccess ? 'flash-green' : 'flash-red';

    // Replace the content of the coin element with the appropriate icon
    coin.innerHTML = `<i class="${iconClass}"></i>`;
    coin.classList.add(flashClass);

    setTimeout(() => {
      coin.classList.remove(flashClass);
      // Restore the original content after the flash effect
      coin.innerHTML = originalContent;
    }, 1000);
  }


  function getChapterId (coin, page) {
    const indicator = getSelector(window.location.origin).chapterIdIndicator;
    let chapterElement;
    if (page === 'series-page') {
      chapterElement = coin.closest(".wp-manga-chapter");
    } else if (page === 'chapter-page') {
      chapterElement = coin;
    } else {
      console.error(`Invalid page type "${page}" provided. Use 'series-page' or 'chapter-page'.`);
      return { chapterId: null, chapterElement: null };
    }

    // Check if chapterElement was successfully assigned
    if (!chapterElement) {
      console.error("Chapter element not found.");
      return { chapterId: null, chapterElement: null };
    }

    // Extract the chapter ID from the class name
    const chapterClass = Array.from(chapterElement?.classList || [])
      .find(className => className.startsWith(indicator)) || null;

    if (!chapterClass) {
        console.error("Chapter class not found.");
        return { chapterId: null, chapterElement: null };
    }

    const chapterId = chapterClass.split('-')[2] || null;
    return { chapterId, chapterElement };
  }

  function getNonceElement() {
    return document.querySelector(getSelector(window.location.origin).noncePlaceholder);
  }

  /**
   * Function to unlock a chapter
   * @param {HTMLElement} coin - The coin element
   * @returns {Promise<boolean>} True if the chapter was unlocked successfully, false otherwise
   */
  async function unlockChapter(coin, origin) {
    if (!coin || !(coin instanceof Element)) {
      console.error("Invalid coin element");
      return false;
    }
    const { chapterId, chapterElement } = getChapterId(coin, origin);
    const nonce = getNonceElement()?.value;

    if (!chapterElement || !chapterId || !nonce) {
      console.error("Required element not found");
      return false;
    }

    // Extract the coin cost using the universal function
    const chapterCoinCost = getCoinCost(coin);
    if (chapterCoinCost === null) {
        console.error("Unable to determine coin cost.");
        return false;
    }

    const postData = new URLSearchParams({
      action: getSelector(window.location.origin).unlockAction,
      chapter: chapterId,
      nonce: nonce,
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
          await updateBalance(chapterCoinCost);
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
          } else {
            console.warn("Lock Icon element not found! Cannot update the icon class");
          }

          // Clone the <a> element to remove all event listeners
          const newLinkElement = linkElement.cloneNode(true);
          linkElement.parentNode.replaceChild(newLinkElement, linkElement);
        } else {
          console.warn("Link element not found! Cannot update the href attribute");
        }

        // Remove the event listener after success
        coin.removeEventListener('click', handleCoinClick);

        // Call findAndLinkifyCoins to update the total cost and button text
        if (origin === 'series-page') {
          debouncedFindAndLinkifyCoins();
        }
        return true;
      } else {
        console.error("Failed to buy chapter:", data.data.message);
        return false;
      }

    } catch (error) {
      console.error("Error:", error);
      return false;
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

        const updateButtonContent = () => {
          // Clear existing content
          buttonText.textContent = 'Unlock All ';

          // Create and append the icon element
          const icon = document.createElement('i');
          icon.classList.add('fas', 'fa-coins');
          buttonText.appendChild(icon);

          // Append the total cost text
          const costText = document.createTextNode(` ${totalCost}`);
          buttonText.appendChild(costText);

          // Update the button's state based on totalCost
          console.log("Updating the UnlockAllButton State")
          setButtonState(button, totalCost === 0 ? 'disable' : 'enable');
        };

        updateButtonContent();
        button.appendChild(buttonText);
        elementSpinner(button, false);
        targetElement.appendChild(button);
        console.log("Button inserted successfully");

        // Expose updateButtonContent for external calls
        button.updateContent = updateButtonContent;

        button.addEventListener("click", async () => {
          const originalWidth = button.offsetWidth; // Save original button width
          button.style.width = `${originalWidth}px`; // Set button width to its original width
          buttonText.style.display = "none"; // Hide button text
          elementSpinner(button, true); // Show spinner
          setButtonState(button, 'disable'); // Disable the button

          try {
            await unlockAllChapters();
          } catch (error) {
            console.error("Error unlocking all chapters:", error);
          } finally {
            elementSpinner(button, false); // Hide spinner
            updateButtonContent(); // Restore original button content dynamically then enable or disable button depending on totalcost
            buttonText.style.display = "inline"; // Show button text
            button.style.width = 'auto'; // Reset button width to auto
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
   * Executes asynchronous tasks with a specified concurrency limit.
   *
   * @param {number} limit - The maximum number of concurrent tasks.
   * @param {Array<Function>} tasks - An array of functions that return Promises.
   * @returns {Promise<Array>} - Resolves when all tasks have completed.
   * @throws {Error} - If the concurrency limit is less than or equal to zero.
   */
  async function withConcurrencyLimit(limit, tasks) {
    if (limit < 0) {
      throw new Error("Concurrency limit must be greater than 0");
    }
    if (limit === 0) {
      // If limit is 0, execute all tasks at once
      const promises = tasks.map(task => task());
      return Promise.all(promises);
    }

    const results = [];
    const executing = new Set();

    for (const task of tasks) {
      const p = task();
      results.push(p);
      executing.add(p);

      // When the number of executing tasks reaches the limit, wait for any to finish
      if (executing.size >= limit) {
          await Promise.race(executing);
      }

      // Once a task completes, remove it from the executing set
      p.finally(() => executing.delete(p));
    }

    return Promise.all(results);
  }

  /**
   * Function to unlock all chapters
   */
  async function unlockAllChapters() {
    try {
      const hasEnoughBalance = await checkBalance(totalCost);
      if (!hasEnoughBalance) {
        if (balance === null) {
          alert("Unable to retrieve your balance. Please check your network connection and try again.");
        } else {
          alert(`Balance (${balance.toLocaleString()}) is not enough to unlock all chapters! (Cost: ${totalCost.toLocaleString()})`);
        }
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
      const premiumChapterIndicator = getSelector(window.location.origin).premiumChapterIndicator;
      const coinElements = Array.from(document.querySelectorAll(premiumChapterIndicator)).reverse();

      await withConcurrencyLimit(concurrencyLimit, coinElements.map(coin => async () => {
        try {
          setProcessingCoin(coin, 'add');
          setButtonState(coin, 'disable'); // Disable the button
          elementSpinner(coin, true);
          const result = await unlockChapter(coin, 'series-page');
          if (!result) {
            await flashCoin(coin, false);
            console.error(`Failed to unlock chapter for coin: ${coin.textContent}`);
            setButtonState(coin, 'enable'); // Re-enable the button
          }
        } catch (error) {
          await flashCoin(coin, false);
          setButtonState(coin, 'enable'); // Re-enable the button
          console.error(`Error unlocking chapter for coin: ${coin.textContent}`, error);
        } finally {
          setProcessingCoin(coin, 'delete'); // Ensure coin is removed from the set
          elementSpinner(coin, false);
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
   */
  async function autoUnlockChapters() {
    const globalConcurrencyLimit = concurrencyLimit;
    concurrencyLimit = 1; // Set concurrency limit to 1 for auto unlock

    const headNextButton = document.getElementById("manga-reading-nav-head")?.querySelector(".nav-next");
    const footNextButton = document.getElementById("manga-reading-nav-foot")?.querySelector(".nav-next");

    let nextButton = headNextButton || footNextButton;

    if (!nextButton) {
      console.log("Next button not found! Possibly, this is the last chapter.");
      return;
    }

    const checkAndMarkNextChapter = () => {
      const linkElement = nextButton.querySelector('a');
      if (!linkElement) {
          console.warn("Link element not found.");
          return false;
      }

      const isUnlocked = !nextButton.classList.contains("premium-block");
      const addClass = isUnlocked ? "unlocked-green" : "locked-red";
      const removeClass = isUnlocked ? "locked-red" : "unlocked-green";

      console.log(`Next chapter is ${isUnlocked ? "already unlocked" : "locked"}`);

      linkElement.classList.add(addClass);
      linkElement.classList.remove(removeClass);
      return isUnlocked;
    };

    // Initial check before attempting to unlock
    if (checkAndMarkNextChapter()) {
      return;
    }

    try {
      await unlockChapter(nextButton, 'chapter-page');
      checkAndMarkNextChapter();
    } catch (error) {
      console.error("Error:", error);
      await flashCoin(nextButton, false);
      } finally {
        concurrencyLimit = globalConcurrencyLimit; // Reset concurrency limit
      }
  }

  /**
   * Retrieves the title of the current series from the page.
   *
   * @returns {string} The title of the series, or 'Unknown Series' if not found.
   */
  function getSeriesTitle() {
      const seriesTitleElement = document.querySelector('.post-title h1');
      return seriesTitleElement ? seriesTitleElement.textContent.trim() : 'Unknown Series';
  }
  
  /**
   * Logs detailed information about each chapter associated with the provided coin elements.
   *
   * @param {NodeListOf<HTMLElement>} coinElements - A collection of coin elements representing chapters.
   *
   * @typedef {Object} ChapterDetails
   * @property {string} chapterId - The unique identifier of the chapter.
   * @property {string} nonce - The nonce value for security purposes.
   * @property {string} action - The action to be performed for unlocking the chapter.
   * @property {string} unlockRequestURL - The URL to request unlocking the chapter.
   *
   * @typedef {Object} ChapterInfo
   * @property {string} chapterTitle - The title of the chapter.
   * @property {ChapterDetails} chapterDetails - Detailed information about the chapter.
   *
   * @typedef {Object} SeriesDetails
   * @property {string} seriesTitle - The title of the series.
   * @property {ChapterInfo[]} chapters - An array of chapter details.
   *
   * @returns {void}
   */
  function logDetails(coinElements) {
      const seriesTitle = getSeriesTitle();
      const seriesDetails = {
          seriesTitle,
          chapters: []
      };
  
      coinElements.forEach(coin => {
          const { chapterId } = getChapterId(coin, 'series-page');
          const nonce = getNonceElement()?.value;
          const action = getSelector(window.location.origin).unlockAction;
  
          // Find the ancestor element that contains the chapter title
          const ancestorElement = coin.closest('.wp-manga-chapter');
          const chapterTitle = ancestorElement?.querySelector('a')?.textContent.trim() || 'Unknown Title';
  
          // Construct the unlock request URL
          const unlockRequestURL = getSelector(window.location.origin).unlockRequestURL;
          // TODO: Update the URL structure as needed based on the actual endpoint
  
          // Only push if chapterId is available to ensure data integrity
          if (chapterId) {
              seriesDetails.chapters.push({
                  chapterTitle,
                  chapterDetails: {
                      chapter: chapterId,
                      nonce,
                      action,
                      unlockRequestURL
                  }
              });
          } else {
              console.warn(`Chapter ID not found for chapter titled "${chapterTitle}".`);
          }
      });
  
      console.log(JSON.stringify(seriesDetails, null, 2));
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
      } else if (isChapterPage) {
        if (autoUnlockSetting) {
          console.log("Auto unlock is enabled. Starting auto unlock...");
          autoUnlockChapters();
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