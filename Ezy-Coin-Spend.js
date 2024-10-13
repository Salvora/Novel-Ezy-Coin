// ==UserScript==
// @name         Ezy-Coin-Spend
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Userscript to spend your coins to unlock chapters easily
// @match        https://darkstartranslations.com/manga/*
// @match        https://hiraethtranslation.com/novel/*

// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Check if we're on a non-chapter page (exclude any page with /chapter in the URL)
    if (!window.location.pathname.includes('/chapter')) {
        console.log('Script is running on a valid manga page (not a chapter page)');

        // Function to handle the click event
        async function handleCoinClick(event) {
            event.preventDefault();
            console.log('Coin clicked'); // Debugging statement

            // Extract chapter ID from the parent element's class
            const chapterElement = event.target.closest('.wp-manga-chapter');
            if (!chapterElement) {
                console.error('Chapter element not found');
                return;
            }

            const chapterIdMatch = chapterElement.className.match(/data-chapter-(\d+)/);
            if (!chapterIdMatch) {
                console.error('Chapter ID not found');
                return;
            }
            const chapterId = chapterIdMatch[1];

            // Extract nonce value from the hidden input field
            const nonceElement = document.querySelector('input[name="wp-manga-coin-nonce"]');
            if (!nonceElement) {
                console.error('Nonce element not found');
                return;
            }
            const nonceValue = nonceElement.value;

            // Prepare the POST request data
            const postData = new URLSearchParams();
            postData.append('action', 'wp_manga_buy_chapter');
            postData.append('chapter', chapterId);
            postData.append('nonce', nonceValue);

            try {
                // Send the POST request using Fetch API
                const baseUrl = window.location.origin;
                const fetchUrl = `${baseUrl}/wp-admin/admin-ajax.php`;
                const response = await fetch(fetchUrl, {
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

        // Function to handle newly added elements
        function observeCoins() {
            const coinElements = document.querySelectorAll('.premium .coin');
            console.log(`Found ${coinElements.length} coin elements`); // Debugging statement

            coinElements.forEach(coin => {
                if (!coin.dataset.listenerAdded) { // Ensure we don't add multiple listeners
                    coin.addEventListener('click', handleCoinClick);
                    coin.dataset.listenerAdded = true; // Mark the element to prevent duplicate listeners
                    console.log('Event listener added to coin element'); // Debugging statement
                }
            });
        }

        // Set up a MutationObserver to detect when new elements are added to the DOM
        const observer = new MutationObserver(observeCoins);

        // Observe changes in the entire document's body
        observer.observe(document.body, {
            childList: true, // Watch for added/removed child nodes
            subtree: true    // Watch within the subtree of the body
        });

        // Also check if elements are already present initially
        observeCoins();
    } else {
        console.log('Script is not running on a chapter page');
    }
})();
