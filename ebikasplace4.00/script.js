/* ============================================================
   EBIKAS PLACE — Main Script
   ============================================================ */

// ⚠️ REPLACE THIS with your Clerk Publishable Key
const CLERK_PUBLISHABLE_KEY = 'pk_test_YOUR_CLERK_PUBLISHABLE_KEY';

// ---- State ----
let allProducts = [];
let cart = [];
let currentFilter = 'all';
let favorites = new Set();
let searchTerm = '';

// ---- DOM Helpers ----
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

/* ============================================================
   CLERK AUTHENTICATION
   ============================================================ */
async function initClerk() {
  const signInContainer = $('#clerk-sign-in');
  const userContainer = $('#clerk-user');

  try {
    if (typeof Clerk === 'undefined') {
      throw new Error('Clerk script not loaded');
    }

    await window.Clerk.load(CLERK_PUBLISHABLE_KEY);

    function updateAuthUI() {
      if (window.Clerk.user) {
        signInContainer.classList.add('hidden');
        userContainer.classList.remove('hidden');
        userContainer.innerHTML = '';
        window.Clerk.mountUserButton(userContainer, {
          appearance: {
            elements: {
              userButtonAvatar: { width: '38px', height: '38px', borderRadius: '12px' },
              userButtonBox: { borderRadius: '14px' },
            },
          },
        });
      } else {
        signInContainer.classList.remove('hidden');
        userContainer.classList.add('hidden');
      }
    }

    // Mount sign-in button
    window.Clerk.mountSignInButton(signInContainer.querySelector('.sign-in-btn'), {
      mode: 'modal',
      appearance: {
        elements: {
          modalContent: { borderRadius: '24px' },
        },
      },
    });

    updateAuthUI();

    window.Clerk.addListener(() => {
      updateAuthUI();
    });
  } catch (err) {
    console.warn('Clerk not configured. Using fallback auth UI.', err.message);
    // Fallback: show a demo sign-in button
    signInContainer.querySelector('.sign-in-btn').addEventListener('click', () => {
      showToast('Please add your Clerk Publishable Key in script.js to enable authentication.', 'warning');
    });
  }
}

// CTA signup button
$('#cta-signup').addEventListener('click', () => {
  if (window.Clerk && window.Clerk.user) {
    showToast('You are already signed in! 🎉', 'success');
  } else if (window.Clerk) {
    window.Clerk.openSignIn({
      mode: 'modal',
    });
  } else {
    showToast('Please add your Clerk Publishable Key in script.js', 'warning');
  }
});

/* ============================================================
   PRODUCT FETCHING (Fake Store API)
   ============================================================ */
async function fetchProducts() {
  try {
    const res = await fetch('https://fakestoreapi.com/products');
    if (!res.ok) throw new Error('Failed to fetch products');
    const data = await res.json();
    // Filter out electronics — we only want fashion items
    allProducts = data.filter((p) => p.category !== 'electronics');
    renderProducts(allProducts);
  } catch (err) {
    console.error('Error fetching products:', err);
    $('#loading-grid').innerHTML = `
      <div class="no-results glass-card" style="grid-column: 1/-1;">
        <div style="font-size: 48px; margin-bottom: 16px;">😕</div>
        <p style="font-size: 18px; margin-bottom: 8px;">Failed to load products</p>
        <p style="font-size: 14px; color: rgba(255,255,255,0.4);">Please check your connection and try again.</p>
      </div>
    `;
  }
}

/* ============================================================
   PRODUCT RENDERING
   ============================================================ */
function renderProducts(products) {
  const grid = $('#products-grid');
  const loading = $('#loading-grid');

  loading.classList.add('hidden');
  grid.classList.remove('hidden');

  let filtered = products;

  // Apply category filter
  if (currentFilter !== 'all') {
    filtered = filtered.filter((p) => p.category === currentFilter);
  }

  // Apply search
  if (searchTerm) {
    filtered = filtered.filter((p) =>
      p.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="no-results">
        <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
        <p style="font-size: 18px; margin-bottom: 8px; color: #fff;">No products found</p>
        <p style="font-size: 14px;">Try a different search or filter.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered
    .map((product, index) => {
      const isFav = favorites.has(product.id);
      const rating = product.rating?.rate || 0;
      const stars = renderStars(rating);
      const badgeText = getBadge(product);

      return `
      <div class="product-card reveal tilt-card" data-id="${product.id}" style="transition-delay: ${index * 50}ms">
        <div class="product-image-wrap">
          ${badgeText ? `<span class="product-badge">${badgeText}</span>` : ''}
          <button class="product-fav ${isFav ? 'active' : ''}" onclick="toggleFav(event, ${product.id})" aria-label="Favorite">
            <i data-lucide="heart" class="w-4 h-4" style="${isFav ? 'fill: currentColor;' : ''}"></i>
          </button>
          <img src="${product.image}" alt="${escapeHtml(product.title)}" loading="lazy" />
        </div>
        <div class="product-info">
          <div class="product-category-tag">${formatCategory(product.category)}</div>
          <h3 class="product-title">${escapeHtml(product.title)}</h3>
          <div class="product-rating">
            <span class="stars">${stars}</span>
            <span>${rating.toFixed(1)} (${product.rating?.count || 0})</span>
          </div>
          <div class="product-price-row">
            <span class="product-price">$${product.price.toFixed(2)}</span>
            <button class="add-to-cart-btn" onclick="addToCart(${product.id})" aria-label="Add to cart">
              <i data-lucide="plus"></i>
            </button>
          </div>
        </div>
      </div>
    `;
    })
    .join('');

  lucide.createIcons();
  initReveal();
  initTiltCards();
}

function renderStars(rating) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  let stars = '';
  for (let i = 0; i < full; i++) stars += '★';
  if (half) stars += '☆';
  for (let i = full + (half ? 1 : 0); i < 5; i++) stars += '☆';
  return stars;
}

function getBadge(product) {
  if (product.price < 50) return 'Sale';
  if (product.rating?.rate >= 4.5) return 'Top Rated';
  return '';
}

function formatCategory(cat) {
  const map = {
    "men's clothing": "Men's Clothing",
    "women's clothing": "Women's Clothing",
    jewelery: 'Accessories',
  };
  return map[cat] || cat;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/* ============================================================
   FAVORITES
   ============================================================ */
window.toggleFav = function (e, id) {
  e.stopPropagation();
  if (favorites.has(id)) {
    favorites.delete(id);
    showToast('Removed from favorites', 'info');
  } else {
    favorites.add(id);
    showToast('Added to favorites ❤️', 'success');
  }
  renderProducts(allProducts);
};

/* ============================================================
   FILTERS
   ============================================================ */
$$('.filter-pill').forEach((pill) => {
  pill.addEventListener('click', () => {
    $$('.filter-pill').forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    currentFilter = pill.dataset.filter;
    renderProducts(allProducts);
  });
});

// Category cards → scroll to shop + set filter
$$('.category-card').forEach((card) => {
  card.addEventListener('click', () => {
    const cat = card.dataset.category;
    if (cat === 'all') {
      currentFilter = 'all';
    } else if (cat === 'clothing') {
      currentFilter = "men's clothing";
    } else if (cat === 'accessories') {
      currentFilter = 'jewelery';
    } else {
      currentFilter = 'all';
    }
    $$('.filter-pill').forEach((p) => {
      p.classList.toggle('active', p.dataset.filter === currentFilter);
    });
    renderProducts(allProducts);
    document.getElementById('shop').scrollIntoView({ behavior: 'smooth' });
  });
});

/* ============================================================
   SEARCH
   ============================================================ */
$('#search-toggle').addEventListener('click', () => {
  const bar = $('#search-bar');
  bar.classList.toggle('hidden');
  if (!bar.classList.contains('hidden')) {
    setTimeout(() => $('#search-input').focus(), 100);
  }
});

$('#search-input').addEventListener('input', (e) => {
  searchTerm = e.target.value;
  renderProducts(allProducts);
});

/* ============================================================
   CART
   ============================================================ */
function loadCart() {
  const saved = localStorage.getItem('ebikas-cart');
  if (saved) {
    try {
      cart = JSON.parse(saved);
    } catch {
      cart = [];
    }
  }
  updateCartUI();
}

function saveCart() {
  localStorage.setItem('ebikas-cart', JSON.stringify(cart));
}

window.addToCart = function (id) {
  const product = allProducts.find((p) => p.id === id);
  if (!product) return;

  const existing = cart.find((item) => item.id === id);
  if (existing) {
    existing.qty++;
  } else {
    cart.push({
      id: product.id,
      title: product.title,
      price: product.price,
      image: product.image,
      category: product.category,
      qty: 1,
    });
  }
  saveCart();
  updateCartUI();
  showToast(`${truncate(product.title, 30)} added to cart!`, 'success');

  // Bounce cart icon
  const cartBtn = $('#cart-toggle');
  cartBtn.style.animation = 'none';
  setTimeout(() => {
    cartBtn.style.animation = 'cartBounce 0.4s ease';
  }, 10);
};

window.toggleCart = function () {
  const drawer = $('#cart-drawer');
  drawer.classList.toggle('hidden');
  document.body.style.overflow = drawer.classList.contains('hidden') ? '' : 'hidden';
};

$('#cart-toggle').addEventListener('click', toggleCart);

function updateCartUI() {
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  $('#cart-count').textContent = count;
  $('#cart-item-count').textContent = `(${count})`;

  const itemsContainer = $('#cart-items');
  const emptyState = $('#cart-empty');
  const footer = $('#cart-footer');

  if (cart.length === 0) {
    itemsContainer.style.display = 'none';
    emptyState.style.display = 'flex';
    footer.classList.add('hidden');
    return;
  }

  itemsContainer.style.display = 'block';
  emptyState.style.display = 'none';
  footer.classList.remove('hidden');

  itemsContainer.innerHTML = cart
    .map(
      (item) => `
    <div class="cart-item">
      <div class="cart-item-img">
        <img src="${item.image}" alt="${escapeHtml(item.title)}" />
      </div>
      <div class="cart-item-info">
        <div class="cart-item-title">${escapeHtml(item.title)}</div>
        <div class="cart-item-price">$${item.price.toFixed(2)}</div>
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="changeQty(${item.id}, -1)"><i data-lucide="minus" class="w-3 h-3"></i></button>
          <span class="qty-value">${item.qty}</span>
          <button class="qty-btn" onclick="changeQty(${item.id}, 1)"><i data-lucide="plus" class="w-3 h-3"></i></button>
          <button class="cart-item-remove" onclick="removeFromCart(${item.id})" style="margin-left:auto;"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>
      </div>
    </div>
  `
    )
    .join('');

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  $('#cart-subtotal').textContent = `$${subtotal.toFixed(2)}`;
  $('#cart-total').textContent = `$${subtotal.toFixed(2)}`;

  lucide.createIcons();
}

window.changeQty = function (id, delta) {
  const item = cart.find((i) => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    cart = cart.filter((i) => i.id !== id);
  }
  saveCart();
  updateCartUI();
};

window.removeFromCart = function (id) {
  cart = cart.filter((i) => i.id !== id);
  saveCart();
  updateCartUI();
  showToast('Item removed from cart', 'info');
};

// Checkout
$('#checkout-btn').addEventListener('click', () => {
  if (window.Clerk && window.Clerk.user) {
    showToast('Order placed successfully! 🎉', 'success');
    cart = [];
    saveCart();
    updateCartUI();
    toggleCart();
  } else {
    showToast('Please sign in to checkout', 'warning');
    if (window.Clerk) {
      window.Clerk.openSignIn({ mode: 'modal' });
    }
  }
});

/* ============================================================
   3D TILT ON PRODUCT CARDS
   ============================================================ */
function initTiltCards() {
  $$('.tilt-card').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const rx = ((y - cy) / cy) * -8;
      const ry = ((x - cx) / cx) * 8;
      card.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(10px)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateZ(0)';
    });
  });
}

/* ============================================================
   HERO 3D PARALLAX
   ============================================================ */
function initHeroParallax() {
  const scene = $('#hero-scene');
  if (!scene) return;
  const cards = scene.querySelectorAll('.floating-card');

  document.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 2;
    const y = (e.clientY / window.innerHeight - 0.5) * 2;

    cards.forEach((card) => {
      const depth = parseFloat(card.dataset.depth) || 50;
      const tx = x * depth;
      const ty = y * depth;
      const rx = y * 5;
      const ry = x * -5;
      card.style.transform = `translate3d(${tx}px, ${ty}px, 0) rotateX(${rx}deg) rotateY(${ry}deg)`;
    });
  });
}

/* ============================================================
   SCROLL REVEAL (Intersection Observer)
   ============================================================ */
function initReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
  );

  $$('.reveal:not(.visible)').forEach((el) => observer.observe(el));
}

/* ============================================================
   NAVBAR SCROLL EFFECT
   ============================================================ */
let lastScroll = 0;
window.addEventListener('scroll', () => {
  const navbar = $('#navbar');
  const scrolled = window.scrollY;
  if (scrolled > 80) {
    navbar.style.top = '8px';
    navbar.style.width = '90%';
    navbar.style.maxWidth = '900px';
  } else {
    navbar.style.top = '16px';
    navbar.style.width = '95%';
    navbar.style.maxWidth = '1280px';
  }

  // Active nav link based on scroll position
  const sections = ['home', 'shop', 'categories', 'featured', 'about'];
  let active = 'home';
  sections.forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.offsetTop - 200 <= scrolled) {
      active = id;
    }
  });
  $$('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.getAttribute('href') === `#${active}`);
  });
});

/* ============================================================
   MOBILE MENU
   ============================================================ */
$('#mobile-menu-toggle').addEventListener('click', () => {
  $('#mobile-menu').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
});

window.closeMobileMenu = function () {
  $('#mobile-menu').classList.add('hidden');
  document.body.style.overflow = '';
};

/* ============================================================
   NEWSLETTER
   ============================================================ */
$('#newsletter-form').addEventListener('submit', (e) => {
  e.preventDefault();
  showToast('Thanks for subscribing! 📬', 'success');
  e.target.reset();
});

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */
function showToast(message, type = 'success') {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const iconMap = {
    success: 'check-circle',
    info: 'info',
    warning: 'alert-triangle',
  };

  toast.innerHTML = `
    <i data-lucide="${iconMap[type] || 'info'}" class="w-5 h-5" style="color: ${
      type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : '#60a5fa'
    };"></i>
    <span style="font-size: 14px;">${message}</span>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ============================================================
   UTILS
   ============================================================ */
function truncate(text, length) {
  return text.length > length ? text.substring(0, length) + '...' : text;
}

/* ============================================================
   INIT
   ============================================================ */
async function init() {
  await initClerk();
  await fetchProducts();
  loadCart();
  initHeroParallax();
  initReveal();
  lucide.createIcons();

  // Add bounce keyframe dynamically
  const style = document.createElement('style');
  style.textContent = `
    @keyframes cartBounce {
      0%, 100% { transform: scale(1); }
      30% { transform: scale(1.2); }
      60% { transform: scale(0.9); }
    }
  `;
  document.head.appendChild(style);
}

init();