// ==UserScript==
// @name         Ezy-Coin-Spend
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Userscript to spend your coins to unlock chapters easily
// @match        https://darkstartranslations.com/manga/*
// @match        https://hiraethtranslation.com/novel/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // Check if we're on a non-chapter page (exclude any page with /chapter in the URL)
    if (!window.location.pathname.includes('/chapter')) {
        console.log('Script is running on a valid manga page (not a chapter page)');

        // Function to handle newly added elements
        function findAndLinkifyCoins() {
            const coinElements = document.querySelectorAll('.premium-block .coin');
            console.log(`Found ${coinElements.length} coin elements`); // Debugging statement

            coinElements.forEach(coin => {
                if (!coin.dataset.listenerAdded) { // Ensure we don't add multiple listeners
                    coin.addEventListener('click', handleCoinClick);
                    coin.dataset.listenerAdded = true; // Mark the element to prevent duplicate listeners
                    console.log('Event listener added to coin element'); // Debugging statement
                }
            });
        }

        // Function to handle the click event
        async function handleCoinClick(event) {
            event.preventDefault();
            console.log('Coin clicked'); // Debugging statement

            const chapterElement = event.target.closest('.wp-manga-chapter');
            const chapterIdMatch = chapterElement?.className.match(/data-chapter-(\d+)/);
            const nonceElement = document.querySelector('input[name="wp-manga-coin-nonce"]');

            if (!chapterElement || !chapterIdMatch || !nonceElement) {
                console.error('Required element not found');
                return;
            }

            const chapterId = chapterIdMatch[1];
            const nonceValue = nonceElement.value;

            const postData = new URLSearchParams({ action: 'wp_manga_buy_chapter', chapter: chapterId, nonce: nonceValue });

            try {
                const response = await fetch(`${window.location.origin}/wp-admin/admin-ajax.php`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: postData.toString()
                });

                const data = await response.json();
                console.log('Success:', data);
            } catch (error) {
                console.error('Error:', error);
            }
        }

        // Function to create and insert the button
        function createUnlockAllButton() {
            const targetElement = document.getElementById('init-links');
            if (targetElement) {
                const button = document.createElement('button');
                button.textContent = 'Unlock All Chapters';
                button.classList.add('c-btn', 'c-btn_style-1'); // Add classes to the button
                button.style.backgroundColor = '#fe6a10';
                button.style.color = '#ffffff';

                // Explicitly set the line height to match other buttons
                button.style.lineHeight = 'normal'; // Adjust this value as needed

                button.addEventListener('click', () => {
                    console.log('Unlock All Chapters button clicked');
                    // Add your logic to unlock all chapters here
                });

                targetElement.appendChild(button);
                console.log('Button inserted successfully');
            } else {
                console.error('Target element for button not found');
            }
        }

        // Call the function to create and insert the button
        createUnlockAllButton();

        // Create a single MutationObserver instance
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length) {
                    const targetDiv = document.getElementById('manga-chapters-holder');
                    if (targetDiv) {
                        findAndLinkifyCoins();
                        observer.observe(targetDiv, {
                            childList: true,
                            subtree: true
                        });
                        break;
                    }
                }
            }
        });

        // Start observing the document body for the initial presence of the target element
        observer.observe(document.body, { childList: true, subtree: true });

        // Also check if elements are already present initially
        const targetDiv = document.getElementById('manga-chapters-holder');
        if (targetDiv) {
            findAndLinkifyCoins();
            observer.observe(targetDiv, {
                childList: true,
                subtree: true
            });
        } else {
            console.error('Target div #manga-chapters-holder not found');
        }
    } else {
        console.log('Script is not running on a chapter page');
    }
})();