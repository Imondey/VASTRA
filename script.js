function addToCart() {
    alert("Item added to cart!");
}
window.addEventListener('DOMContentLoaded', () => {
const slides = document.querySelectorAll('.slide');
let current = 0;
const slideInterval = 4000; // 4 seconds

function showSlide(index) {
  slides.forEach((slide, i) => {
    slide.classList.remove('active');
    if (i === index) slide.classList.add('active');
  });
}

function nextSlide() {
  current = (current + 1) % slides.length;
  showSlide(current);
}

setInterval(nextSlide, slideInterval);
});

const API_URL = 'http://127.0.0.1:5000';

// Search functionality
function searchProducts() {
  const searchInput = document.getElementById('searchInput');
  const query = searchInput ? searchInput.value.trim() : '';

  if (!query) {
    alert("Please enter a search term.");
    return;
  }

  fetch(`${API_URL}/search?q=${encodeURIComponent(query)}`)
    .then(response => {
      if (!response.ok) throw new Error('Search failed');
      return response.json();
    })
    .then(data => {
      if (Array.isArray(data) && data.length > 0) {
        displaySearchResults(data);
      } else {
        alert("No products found.");
      }
    })
    .catch(error => {
      console.error("Search Error:", error);
      alert("Search error. Please try again.");
    });
}

function displaySearchResults(products) {
  const resultsDiv = document.getElementById('searchResults') || createResultsContainer();
  resultsDiv.innerHTML = '<h2>Search Results (' + products.length + ' items)</h2><div class="product-grid">';
  
  products.forEach(product => {
    resultsDiv.innerHTML += `
      <div class="product-card">
        <img src="${product.image_url}" alt="${product.name}" />
        <h3>${product.name}</h3>
        <p>Category: ${product.category}</p>
        <p><strong>₹${product.price}</strong></p>
        <button onclick="addToCart()">Add to Cart</button>
      </div>
    `;
  });
  
  resultsDiv.innerHTML += '</div>';
  resultsDiv.scrollIntoView({ behavior: 'smooth' });
}

function createResultsContainer() {
  const container = document.createElement('section');
  container.id = 'searchResults';
  container.className = 'products';
  document.querySelector('main').appendChild(container);
  return container;
}

// Add to cart functionality
function addToCart() {
  alert("Item added to cart!");
}

// Allow Enter key to search
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        searchProducts();
      }
    });
  }
});
