// ==UserScript==
// @name        Novel-Ezy-Coin
// @namespace   https://github.com/Salvora
// @version     1.4.2
// @author      Salvora
// @icon        https://raw.githubusercontent.com/Salvora/Novel-Ezy-Coin/refs/heads/main/Images/coins-solid.png
// @updateURL   https://github.com/Salvora/Novel-Ezy-Coin/raw/refs/heads/main/Ezy-Coin-Spend.user.js
// @downloadURL https://github.com/Salvora/Novel-Ezy-Coin/raw/refs/heads/main/Ezy-Coin-Spend.user.js
// @supportURL  https://github.com/Salvora/Novel-Ezy-Coin/issues
// @description Userscript to spend your coins to unlock chapters easily
// @match       https://darkstartranslations.com/manga/*
// @exclude     https://darkstartranslations.com/manga/*/chapter*
// @match       https://hiraethtranslation.com/novel/*
// @exclude     https://hiraethtranslation.com/novel/*/chapter*
// @license     GPL-3.0-or-later; https://www.gnu.org/licenses/gpl-3.0.html
// @grant       none
// @run-at      document-end
// ==/UserScript==

(function () {
  "use strict";
  const processingCoins = new Set(); // Set to track coins being processed

  let balanceElement = null; // Variable to store the balance element
  let balance = 0; // Variable to store the balance value
  let totalCost = 0; // Variable to store the total cost of all chapters
  let observer; // Define the observer globally

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
      unlockAllbutton.innerHTML = `Unlock All <i class="fas fa-coins"></i> ${totalCost}`;
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
  
    const chapterId = chapterIdMatch[1];
    const nonceValue = nonceElement.value;
    const postData = new URLSearchParams({
      action: "wp_manga_buy_chapter",
      chapter: chapterId,
      nonce: nonceValue,
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
      }
  
    } catch (error) {
      console.error("Error:", error);
      coin.disabled = false; // Re-enable the coin element if an error occurs
    } finally {
      processingCoins.delete(coin); // Remove coin from the set
    }
  }

  function createUnlockAllButton() {
    const targetElement = document.getElementById("init-links");
    if (targetElement) {
      const button = document.createElement("button");

      // Function to update button content dynamically
      const updateButtonContent = () => {
        button.innerHTML = `Unlock All <i class="fas fa-coins"></i> ${totalCost}`;
      };
      
      updateButtonContent();
      button.classList.add("c-btn", "c-btn_style-1", "nav-links");
      button.style.backgroundColor = "#fe6a10";
      button.id = "unlock-all-button"; // Assign an ID
      button.style.color = "#ffffff";
      button.style.transition = "transform 0.1s ease";
      button.style.lineHeight = "normal";
      button.style.position = "relative"; // Ensure the spinner is positioned correctly

      // Create spinner element
      const spinner = document.createElement("span");
      spinner.classList.add("spinner");
      spinner.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
      spinner.style.display = "none"; // Hide spinner initially
  
      targetElement.appendChild(button);
      console.log("Button inserted successfully");
  
      button.addEventListener("click", async () => {
        const originalWidth = button.offsetWidth; // Save original button width
        button.style.width = `${originalWidth}px`; // Set button width to its original width
        button.innerHTML = ''; // Clear button content
        button.appendChild(spinner); // Add spinner to button
        spinner.style.display = "inline-block"; // Show spinner
        button.disabled = true; // Disable the button

        await unlockAllChapters();
  
        spinner.style.display = "none"; // Hide spinner
        updateButtonContent(); // Restore original button content dynamically
        button.style.width = 'auto'; // Reset button width to auto
        button.disabled = false; // Re-enable the button

      });
    } else {
      console.error("Target element for button not found");
    }
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
    const coinElements = Array.from(document.querySelectorAll(".premium-block .coin"));
    const batchSize = 5; // Number of coins to process concurrently
    let currentIndex = 0;

    // Function to process a batch of coins
    async function processBatch() {
      const batch = coinElements.slice(currentIndex, currentIndex + batchSize);
      const promises = batch.map(coin => unlockChapter(coin));
      await Promise.all(promises);
      currentIndex += batchSize;
    }

    // Process all coins in batches
    try {
      while (currentIndex < coinElements.length) {
        await processBatch();
        console.log(`Processed ${currentIndex} of ${coinElements.length} coins`);
      }
      // alert("All chapters have been successfully unlocked!");
    } catch (error) {
      console.error("Error unlocking chapters:", error);
      alert("An error occurred while unlocking chapters. Please try again.");
    }
  }

  // // Function to unlock all chapters (simulated) for debugging
  // async function unlockAllChapters() {
  //   console.log("Simulating unlock process...");
  //   await delay(3000); // Simulate a 3-second delay
  //   console.log("Unlock process complete.");
  // }

  // // Function to simulate a delay
  // function delay(ms) {
  //   return new Promise(resolve => setTimeout(resolve, ms));
  // }

  // Function to inject CSS styles
  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .coin {
          transition: transform 0.1s ease;
      }

      .coin.clicked {
          transform: scale(0.90);
      }

      .c-btn:hover {
          background-color: black !important;
          color: white !important;
      }

      .c-btn:active {
          transform: scale(0.95);
          background-color: #333333 !important;
      }

      .c-btn-custom-1 {
        display: inline-block;
        text-align: center;
        white-space: nowrap;
        vertical-align: middle;
        cursor: pointer;
        border-radius: 5px;
        font-weight: 600;
      }

      .c-btn-custom-1:hover {
          background-color: blue !important;
          color: white !important;
      }
      .c-btn-custom-1:active {
          transform: scale(0.95);
          background-color: #333333 !important;
      }

      .flash-red {
        color: red !important;
        animation: flash 1s;
      }

      @keyframes flash {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  // Main initialization function
  function init() {
    if (!window.location.pathname.includes("/chapter")) {
      balance = getBalance();
      if (balance === 0) {
        console.error("Balance not found (Maybe not logged in?), stopping the script");
        return;
      }

      injectStyles();
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
      console.log("Script is not running on a chapter page");
    }
  }

  // Call the init function to start the script
  init();
})();