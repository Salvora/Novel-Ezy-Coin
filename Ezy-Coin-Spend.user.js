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
// @author      Salvora
// @icon        https://raw.githubusercontent.com/Salvora/Novel-Ezy-Coin/refs/heads/main/Images/coins-solid.png
// @homepageURL https://github.com/Salvora/Novel-Ezy-Coin
// @updateURL   https://github.com/Salvora/Novel-Ezy-Coin/raw/refs/heads/main/Ezy-Coin-Spend.user.js
// @downloadURL https://github.com/Salvora/Novel-Ezy-Coin/raw/refs/heads/main/Ezy-Coin-Spend.user.js
// @supportURL  https://github.com/Salvora/Novel-Ezy-Coin/issues
// @description Userscript to spend your coins to unlock chapters easily
// @match       https://darkstartranslations.com/manga/*
// @match       https://hiraethtranslation.com/novel/*
// @license     GPL-3.0-or-later
// @run-at      document-end
// ==/UserScript==

(function () {
  "use strict";
  const processingCoins = new Set(); // Set to track coins being processed

  let balanceElement = null; // Variable to store the balance element
  let balance = 0; // Variable to store the balance value
  let totalCost = 0; // Variable to store the total cost of all chapters
  let observer; // Define the observer globally
  let autoUnlock = false; // Variable to store the auto unlock status

  // Cache for selectors
  const selectorCache = new Map();
  const SETTINGS = {
    checkboxId: 'auto-unlock-checkbox',
    resourceName: 'SETTINGS_HTML'
};
  // Add debounce utility near top of script after variables
  const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(null, args), delay);
    };
  };
  // Create debounced version of findAndLinkifyCoins
  const debouncedFindAndLinkifyCoins = debounce(findAndLinkifyCoins, 250);

  /**
   * Function to get the appropriate selector based on the current URL
   * @returns {string} The selector for the current site
   */
  function getSelector() {
    const siteSelector = {
      "https://darkstartranslations.com": "#manga-chapters-holder",
      "https://hiraethtranslation.com": ".page-content-listing.single-page",
    };
    const url = window.location.origin;
    return siteSelector[url];
  }

  /**
   * Function to get cached selector
   * @returns {string} The cached selector for the current site
   */
  function getCachedSelector() {
    const url = window.location.origin;
    if (!selectorCache.has(url)) {
      selectorCache.set(url, getSelector());
    }
    return selectorCache.get(url);
  }

  // Function to create the settings UI
  function createSettingsUI() {
    const template = GM_getResourceText(SETTINGS.resourceName);

    const container = document.createElement('div');
    container.innerHTML = template;
    document.body.appendChild(container.firstElementChild);

    const checkbox = document.getElementById(SETTINGS.checkboxId);
    const autoUnlock = GM_getValue('autoUnlock', false);
    checkbox.checked = autoUnlock;

    checkbox.addEventListener('change', e => {
        const autoUnlock = e.target.checked;
        GM_setValue('autoUnlock', autoUnlock);
    });
  }


  /**
   * Function to get the user's balance
   * @returns {number} The user's balance
   */
  function getBalance() {
    try {
      balanceElement = document.querySelector(".c-user_menu li:first-child a");
      if (balanceElement) {
        const balanceText = balanceElement.textContent;
        const balanceMatch = balanceText.match(/Balance:\s*([\d,]+)/);
        if (balanceMatch) {
          const balanceString = balanceMatch[1].replace(/,/g, '');
          const parsedBalance = parseInt(balanceString, 10);
          return isNaN(parsedBalance) ? 0 : parsedBalance;
        }
      } else {
      console.error("Balance element not found or invalid format");
      return 0;
      }
    } catch (error) {
      console.error("Error getting balance:", error);
      return 0;
    }
  }

  /**
   * Function to update the user's balance
   * @param {number} delta - The amount to subtract from the balance
   */
  function updateBalance(delta) {
    try {
      if (typeof delta !== 'number' || isNaN(delta)) {
        throw new Error('Invalid delta value for balance update');
      }
      balance = Math.max(0, balance - delta); // Prevent negative balance
      if (balanceElement) {
        const balanceTextNode = balanceElement.childNodes[balanceElement.childNodes.length - 1];
        if (balanceTextNode.nodeType === Node.TEXT_NODE) {
          balanceTextNode.textContent = ` ${balance.toLocaleString()}`;
        }
      }
    } catch (error) {
      console.error('Error updating balance:', error);
    }
  }

  /**
   * Function to check if the user has enough balance
   * @param {number} cost - The cost to check against the balance
   * @returns {boolean} True if the user has enough balance, false otherwise
   */
  function checkBalance(cost) {
    if (cost > balance) {
      console.error("Balance is not enough for purchasing the chapter!!!");
      return false;
    }
    return true;
  }

  /**
   * Function to handle newly added elements and linkify coins
   */
  function findAndLinkifyCoins() {
    try {
      const coinElements = document.querySelectorAll(".premium-block .coin");
      console.log(`Found ${coinElements.length} coin elements`);

      coinElements.forEach((coin) => {
        if (!coin.dataset.listenerAdded) {
          coin.addEventListener("click", handleCoinClick);
          coin.classList.add("c-btn-custom-1");
          coin.dataset.listenerAdded = true;
          console.log("Event listener added to coin elements");
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
   * Function to handle the click event on a coin
   * @param {Event} event - The click event
   */
  async function handleCoinClick(event) {
    event.preventDefault();
    const coin = event.currentTarget;
    const chapterCoinCost = parseInt(coin.textContent.replace(/,/g, ''), 10);

    if (processingCoins.has(coin)) {
      console.log("Coin is already being processed, ignoring click");
      return;
    }
    if (!checkBalance(chapterCoinCost)) {
      flashCoin(coin);
      return;
    }

    processingCoins.add(coin); // Add coin to the set
    coin.disabled = true; // Disable the coin element to prevent multiple clicks
    coin.classList.add("clicked");
    console.log("Coin clicked");

    try {
      setTimeout(() => coin.classList.remove("clicked"), 100);
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
    const nonceElement = document.querySelector('input[name="wp-manga-coin-nonce"]');

    if (!chapterElement || !chapterIdMatch || !nonceElement) {
      console.error("Required element not found");
      coin.disabled = false; // Re-enable the coin element if required elements are not found
      processingCoins.delete(coin); // Remove coin from the set
      return false;
    }

    // Create spinner element
    const spinner = document.createElement("span");
    spinner.classList.add("spinner");
    spinner.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
    coin.appendChild(spinner);
    spinner.classList.add("show"); // Show spinner

    const postData = new URLSearchParams({
      action: "wp_manga_buy_chapter",
      chapter: chapterIdMatch[1],
      nonce: nonceElement.value,
    });

    try {
      const response = await sendRequest(`${window.location.origin}/wp-admin/admin-ajax.php`, {
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
          updateBalance(parseInt(coin.textContent.replace(/,/g, ''), 10));
        } catch (error) {
          console.error('Error calling updateBalance:', error);
        }

        // Remove the premium-block class from the chapter element
        chapterElement.classList.remove("premium-block");

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
      spinner.classList.remove("show"); // Hide spinner
      coin.removeChild(spinner); // Remove spinner element
    }
    return true;
  }

  async function sendRequest(url, options, timeout = 5000) {
    return Promise.race([
        fetch(url, options),
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
      const targetElement = document.getElementById("init-links");
      if (targetElement) {
        const button = document.createElement("button");
        button.id = "unlock-all-button"; // Assign an ID
        button.classList.add("c-btn", "c-btn_style-1", "nav-links");

        // Create a span element for the button text
        const buttonText = document.createElement("span");
        buttonText.innerHTML = `Unlock All <i class="fas fa-coins"></i> ${totalCost}`;

        // Create spinner element
        const spinner = document.createElement("span");
        spinner.classList.add("spinner");
        spinner.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;

        button.appendChild(buttonText);
        button.appendChild(spinner);
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
          spinner.classList.add("show"); // Show spinner
          button.disabled = true; // Disable the button

          try {
            await unlockAllChapters();
          } catch (error) {
            console.error("Error unlocking all chapters:", error);
          } finally {
            spinner.classList.remove("show"); // Hide spinner
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
    const results = [];
    const executing = [];

    for (const task of tasks) {
      const p = Promise.resolve().then(() => task());
      results.push(p);

      if (limit <= tasks.length) {
        const e = p.then(() => executing.splice(executing.indexOf(e), 1));
        executing.push(e);
        if (executing.length >= limit) {
          await Promise.race(executing);
        }
      }
    }

    return Promise.all(results);
  }

  /**
   * Function to unlock all chapters
   */
  async function unlockAllChapters() {
    try {
      if (!checkBalance(totalCost)) {
        alert("Balance is not enough to unlock all chapters!");
        return;
      }
      if (totalCost === 0) {
        return;
      }
      const userConfirmed = confirm(`You are about to spend ${totalCost} coins to unlock all chapters. Do you want to proceed?`);
      if (!userConfirmed) {
        return;
      }

      const coinElements = Array.from(document.querySelectorAll(".premium-block .coin")).reverse();
      const concurrencyLimit = 5;

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
    const nonceElement = document.querySelector('input[name="wp-manga-coin-nonce"]');

    const postData = new URLSearchParams({
      action: "wp_manga_buy_chapter",
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
      balance = getBalance();
      if (balance === 0) {
        console.error("Balance not found (Maybe not logged in?), stopping the script");
        return;
      }
      GM_addStyle(GM_getResourceText("customCSS"));
      if (!window.location.pathname.includes("/chapter")) {
        createUnlockAllButton();
        observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.addedNodes.length || mutation.removedNodes.length) {
              debouncedFindAndLinkifyCoins(); // Use debounced version
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
        const targetDiv = document.querySelector(getCachedSelector());
        if (targetDiv) {
          debouncedFindAndLinkifyCoins(); // Use debounced version
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
        // createSettingsUI();
      } catch (error) {
        console.error("Error creating Settings UI block:", error);
      }
    }
  }

  // Call the init function to start the script
  init();
})();