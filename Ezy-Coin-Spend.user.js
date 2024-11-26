// ==UserScript==
// @name        Novel-Ezy-Coin
// @namespace   https://github.com/Salvora
// @version     1.4.2
// @grant       GM_addStyle
// @grant       GM_getResourceText
// @resource    customCSS https://github.com/Salvora/Novel-Ezy-Coin/raw/refs/heads/dev/styles.css?v=1.0.0
// @author      Salvora
// @icon        https://raw.githubusercontent.com/Salvora/Novel-Ezy-Coin/refs/heads/main/Images/coins-solid.png
// @homepageURL https://github.com/Salvora/Novel-Ezy-Coin
// @updateURL   https://github.com/Salvora/Novel-Ezy-Coin/raw/refs/heads/main/Ezy-Coin-Spend.user.js
// @updateURL   https://update.greasyfork.org/scripts/516727/Novel-Ezy-Coin.user.js
// @downloadURL https://github.com/Salvora/Novel-Ezy-Coin/raw/refs/heads/main/Ezy-Coin-Spend.user.js
// @downloadURL https://update.greasyfork.org/scripts/516727/Novel-Ezy-Coin.user.js
// @supportURL  https://github.com/Salvora/Novel-Ezy-Coin/issues
// @description Userscript to spend your coins to unlock chapters easily
// @match       https://darkstartranslations.com/manga/*
// @exclude     https://darkstartranslations.com/manga/*/chapter*
// @match       https://hiraethtranslation.com/novel/*
// @exclude     https://hiraethtranslation.com/novel/*/chapter*
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

  // Function to get the appropriate selector based on the current URL
  function getSelector() {
    const SiteSelectors = {
      "https://darkstartranslations.com": "#manga-chapters-holder",
      "https://hiraethtranslation.com": ".page-content-listing.single-page",
    };
    const url = window.location.origin;
    return SiteSelectors[url];
  }

  function getBalance() {

    balanceElement = document.querySelector(".c-user_menu li:first-child a");
    if (balanceElement) {
      const balanceText = balanceElement.textContent;
      const balanceMatch = balanceText.match(/Balance:\s*\d+/);
      if (balanceMatch) {
        return parseInt(balanceMatch[0].replace('Balance: ', ''));
      }
    }
    console.error("Balance element not found");
    return 0;
  }

  async function getDynamicBalance() {
    const parentElement = document.querySelector('.c-user_menu');
    const nonceElement = parentElement.querySelector('a[href*="wp-login.php?action=logout"]');
    const url = new URL(nonceElement.href);
    const nonceValue = url.searchParams.get('_wpnonce');
    const postData = new URLSearchParams({
      action: "wp_manga_chapter_coin_user_balance",
      nonce: nonceValue,
    });
    const response = await fetch(`${window.location.origin}/wp-admin/admin-ajax.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: postData.toString(),
    });

    const data = await response.json();
    if (data.success && data.data.coin) {
      return parseInt(data.data.coin);
    }
    console.error("Failed to get balance:", data.data.message);
    return
  }

  function updateBalance(delta) {
    balance -= delta;
    balanceElement.textContent = `Balance: ${balance}`;
  }

  function checkBalance(cost) {
    if (cost > balance) {
      console.error("Balance is not enough for purchasing the chapter!!!");
      return false;
    }
    return true;
  }

  // Function to handle newly added elements
  function findAndLinkifyCoins() {
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

    // Calculate totalCost using Array.from and reduce
    totalCost = Array.from(coinElements)
      .reduce((total, coin) => total + (parseFloat(coin.textContent) || 0), 0);

    // Update button text
    const unlockAllbutton = document.getElementById("unlock-all-button");
    if (unlockAllbutton) {
      const buttonText = unlockAllbutton.querySelector("span:first-child");
      if (buttonText) {
        buttonText.innerHTML = `Unlock All <i class="fas fa-coins"></i> ${totalCost}`;
      }
    }

    console.log(`Total cost calculated: ${totalCost}`);
  }

  // Function to handle the click event
  async function handleCoinClick(event) {
    event.preventDefault();
    const coin = event.currentTarget;
    const chapterCoinCost = parseInt(coin.textContent);
    if (processingCoins.has(coin)) {
      console.log("Coin is already being processed, ignoring click");
      return;
    }
    if (!checkBalance(chapterCoinCost)) {
      // Flash the entire coin element
      coin.classList.add('flash-red', 'fa-times-circle');
      setTimeout(() => {
        coin.classList.remove('flash-red', 'fa-times-circle');
      }, 1000);
      return;
    }
    processingCoins.add(coin); // Add coin to the set
    coin.disabled = true; // Disable the coin element to prevent multiple clicks
    coin.classList.add("clicked");
    console.log("Coin clicked");
    setTimeout(() => coin.classList.remove("clicked"), 100);
    await unlockChapter(coin);
  }

  async function unlockChapter(coin) {
    const chapterElement = coin.closest(".wp-manga-chapter");
    const chapterIdMatch = chapterElement?.className.match(/data-chapter-(\d+)/);
    const nonceElement = document.querySelector('input[name="wp-manga-coin-nonce"]');
    if (!chapterElement || !chapterIdMatch || !nonceElement) {
      console.error("Required element not found");
      coin.disabled = false; // Re-enable the coin element if required elements are not found
      processingCoins.delete(coin); // Remove coin from the set
      return;
    }
  
    const postData = new URLSearchParams({
      action: "wp_manga_buy_chapter",
      chapter: chapterIdMatch[1],
      nonce: nonceElement.value,
    });
    try {
      const response = await fetch(
        `${window.location.origin}/wp-admin/admin-ajax.php`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: postData.toString(),
        }
      );
  
      const data = await response.json();
      console.log("Successfully sent the request:", data);
      if (data.success && data.data.status) {
        // Update the balance element
        updateBalance(parseInt(coin.textContent));
  
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
        findAndLinkifyCoins();
      } else {
        console.error("Failed to buy chapter:", data.data.message);
        coin.disabled = false; // Re-enable the coin element if the request fails
        return false
      }
  
    } catch (error) {
      console.error("Error:", error);
      coin.disabled = false; // Re-enable the coin element if an error occurs
      return false;
    } finally {
      processingCoins.delete(coin); // Remove coin from the set
    }
    return true;
  }

  function createUnlockAllButton() {
    const targetElement = document.getElementById("init-links");
    if (targetElement) {
      const button = document.createElement("button");
  
      // Create a span element for the button text
      const buttonText = document.createElement("span");
      buttonText.innerHTML = `Unlock All <i class="fas fa-coins"></i> ${totalCost}`;

      // Create spinner element
      const spinner = document.createElement("span");
      spinner.classList.add("spinner");
      spinner.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
      spinner.style.display = "none"; // Hide spinner initially

      button.appendChild(buttonText);
      button.appendChild(spinner);

      button.classList.add("c-btn", "c-btn_style-1", "nav-links");
      button.style.backgroundColor = "#fe6a10";
      button.id = "unlock-all-button"; // Assign an ID
      button.style.color = "#ffffff";
      button.style.transition = "transform 0.1s ease";
      button.style.lineHeight = "normal";
      button.style.position = "relative"; // Ensure the spinner is positioned correctly
  
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
        spinner.style.display = "inline-block"; // Show spinner
        button.disabled = true; // Disable the button

        try {
          await unlockAllChapters();
        } catch (error) {
          console.error("Error unlocking all chapters:", error);
        } finally {
          spinner.style.display = "none"; // Hide spinner
          updateButtonContent(); // Restore original button content dynamically
          buttonText.style.display = "inline"; // Show button text
          button.style.width = 'auto'; // Reset button width to auto
          button.disabled = false; // Re-enable the button
        }
      });
    } else {
      console.error("Target element for button not found");
    }
  }

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

  // Function to unlock all chapters
  async function unlockAllChapters() {
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

    // Unlock all coins
    const coinElements = Array.from(document.querySelectorAll(".premium-block .coin")).reverse();
    const concurrencyLimit = 5; // Limit the number of concurrent requests

    // Function to unlock a single coin
    async function unlockSingleCoin(coin) {
      const result = await unlockChapter(coin);
      if (result === false) {
        throw new Error("Failed to unlock chapter");
      }
    }

    // Process all coins with concurrency limit
    try {
      await withConcurrencyLimit(concurrencyLimit, coinElements.map(coin => () => unlockSingleCoin(coin)));
      console.log("All chapters have been successfully unlocked!");
    } catch (error) {
      console.error("Error unlocking chapters:", error);
      alert("An error occurred while unlocking chapters. Please try again.");
    }
  }

  function autoUnlockChapters() {
      const chapterList = document.getElementById("manga-reading-nav-head");
      const nextButton = document.getElementById("manga-reading-nav-foot").querySelector(".nav-next");
      // Check if next button is premium
      const CurrentChapter = chapterList.querySelectorAll("ol li.active")[0].textContent.trim();
      const selectElement = document.querySelector(".c-selectpicker.selectpicker_chapter.selectpicker.single-chapter-select");
      const selectedOption = selectElement.querySelector("option[selected='selected']");

      if (chapterList) {

      }

  }
  
  // Main initialization function
  function init() {
    if (!window.location.pathname.includes("/chapter")) {
      balance = getBalance();
      if (balance === 0) {
        console.error("Balance not found (Maybe not logged in?), stopping the script");
        return;
      }

      GM_addStyle(GM_getResourceText("customCSS"));
      createUnlockAllButton();

      observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.addedNodes.length || mutation.removedNodes.length) {
            findAndLinkifyCoins();
            break;
          }
        }
      });

      const targetDiv = document.querySelector(getSelector());
      if (targetDiv) {
        findAndLinkifyCoins();
        observer.observe(targetDiv, { childList: true, subtree: true });
      } else {
        console.error("Target div not found");
      }
    } else {
      console.log("Script is not running on a series page");
    }
  }

  // Call the init function to start the script
  init();
})();