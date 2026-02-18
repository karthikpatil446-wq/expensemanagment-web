document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const loginPage = document.getElementById('login-page');
    const guestBtn = document.getElementById('guest-mode-btn');
    const loginForm = document.getElementById('login-form');
    const googleBtn = document.getElementById('google-signin-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authModeInput = document.getElementById('auth-mode');
    const signinTab = document.getElementById('signin-tab');
    const signupTab = document.getElementById('signup-tab');
    const forgotPasswordBtn = document.getElementById('forgot-password-btn');

    // Firebase Globals (from index.html/dashboard.html)
    const auth = window.firebaseAuth;
    const {
        signInWithEmailAndPassword,
        createUserWithEmailAndPassword,
        signOut,
        onAuthStateChanged,
        GoogleAuthProvider,
        signInWithPopup,
        sendPasswordResetEmail,
        // Firestore functions
        collection,
        addDoc,
        getDocs,
        updateDoc,
        deleteDoc,
        doc,
        query,
        orderBy,
        onSnapshot,
        setDoc
    } = window.firebaseModules || {};

    // --- Navigation Logic ---
    function initNavigation() {
        const navLinks = document.querySelectorAll('.nav-link[data-page]');
        const actionCards = document.querySelectorAll('.action-card[data-action]');
        const pages = document.querySelectorAll('.content-page');
        const backBtns = document.querySelectorAll('.back-btn');
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        const navLinksContainer = document.getElementById('nav-links');

        function switchPage(pageId) {
            // Hide all pages
            pages.forEach(page => page.classList.remove('active'));
            // Show target page
            const targetPage = document.getElementById(pageId);
            if (targetPage) targetPage.classList.add('active');

            // Update Nav Links
            navLinks.forEach(link => {
                if (link.dataset.page === pageId) {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            });

            // Close mobile menu if open
            if (navLinksContainer) navLinksContainer.classList.remove('active');
        }

        // Nav Links
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                switchPage(link.dataset.page);
            });
        });

        // Quick Action Cards
        actionCards.forEach(card => {
            card.addEventListener('click', () => {
                switchPage(card.dataset.action);
            });
        });

        // Back Buttons
        backBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                switchPage(btn.dataset.page);
            });
        });

        // Mobile Menu
        if (mobileMenuBtn && navLinksContainer) {
            mobileMenuBtn.addEventListener('click', () => {
                navLinksContainer.classList.toggle('active');
                mobileMenuBtn.classList.toggle('active');
            });
        }
    }

    // Call init if on dashboard
    if (window.location.pathname.includes('dashboard.html')) {
        initNavigation();
    }

    // --- Synchronization & State Management ---
    let expenses = [];
    let monthlyLimit = localStorage.getItem('monthlyLimit') || 0;
    let activeSubscriptions = [];

    function clearSubscriptions() {
        console.log(`Clearing ${activeSubscriptions.length} active subscriptions...`);
        activeSubscriptions.forEach(unsubscribe => {
            if (typeof unsubscribe === 'function') unsubscribe();
        });
        activeSubscriptions = [];
    }

    // --- Authentication Logic ---

    // --- Initialization & Lifecycle ---
    console.log('App initialization starting...');
    const isDashboard = window.location.pathname.includes('dashboard.html');

    // 1. Unified Auth & App State Handler
    onAuthStateChanged(auth, (user) => {
        console.log('Auth state changed. User:', user ? user.email : 'None');
        const userType = localStorage.getItem('userType');

        if (user) {
            // Logged in via Firebase
            if (!isDashboard) {
                console.log('Redirecting to dashboard (logged in)');
                window.location.href = 'dashboard.html';
                return;
            }

            const userEmailDisplay = document.getElementById('user-email-display');
            if (userEmailDisplay) {
                userEmailDisplay.textContent = user.isAnonymous ? 'Guest User' : user.email;
            }
            localStorage.setItem('userType', user.isAnonymous ? 'guest' : 'user');

            // Initialize Dashboard specifically for logged-in user
            clearSubscriptions();
            expenses = []; // Clear guest data
            loadExpenses();
        } else {
            // Not logged in via Firebase
            if (isDashboard) {
                clearSubscriptions(); // Ensure no user listeners are active
                if (userType === 'guest') {
                    console.log('Running in Guest Mode');
                    const userEmailDisplay = document.getElementById('user-email-display');
                    if (userEmailDisplay) userEmailDisplay.textContent = 'guest@example.com';

                    // Initialize Dashboard for Guest - Load from localStorage
                    const savedExpenses = localStorage.getItem('guest_expenses');
                    if (savedExpenses) {
                        try {
                            expenses = JSON.parse(savedExpenses);
                            console.log(`Loaded ${expenses.length} expenses from localStorage`);
                        } catch (e) {
                            console.error('Error parsing guest expenses:', e);
                            expenses = [];
                        }
                    }

                    renderExpenses();
                    updateStats();
                } else {
                    console.log('Redirecting to login (not logged in & not guest)');
                    window.location.href = 'index.html';
                    return;
                }
            }
        }

        // Final UI setup that applies to both User and Guest on Dashboard
        if (isDashboard) {
            const dateInput = document.getElementById('expense-date');
            if (dateInput) dateInput.valueAsDate = new Date();
            const dateDisplay = document.getElementById('current-date');
            if (dateDisplay) {
                const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
                dateDisplay.textContent = new Date().toLocaleDateString('en-US', options);
            }
        }
    });

    // 2. Guest Mode Click Handler
    if (guestBtn) {
        guestBtn.addEventListener('click', async () => {
            console.log('Guest Mode clicked - Starting Anonymous Auth');
            try {
                const { signInAnonymously } = window.firebaseModules || {};
                if (!signInAnonymously) throw new Error('Anonymous Auth module not loaded.');

                await signInAnonymously(auth);
                // Auth state observer (above) will handle the redirect
            } catch (error) {
                console.error('Guest Auth Error:', error);
                showToast('Failed to start guest session', 'error');
            }
        });
    }

    // 3. Email/Password Auth
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            const mode = authModeInput.value;
            const btnText = authSubmitBtn.querySelector('span');
            const originalText = btnText.textContent;

            try {
                console.log(`[AUTH] Starting ${mode} for email:`, email);
                if (!signInWithEmailAndPassword || !createUserWithEmailAndPassword) {
                    throw new Error('Authentication modules not loaded properly.');
                }

                btnText.textContent = 'Processing...';
                authSubmitBtn.disabled = true;

                if (mode === 'signup') {
                    console.log('[AUTH] Calling createUserWithEmailAndPassword...');
                    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                    console.log('[AUTH] Signup success:', userCredential.user.uid);
                } else {
                    console.log('[AUTH] Calling signInWithEmailAndPassword...');
                    const userCredential = await signInWithEmailAndPassword(auth, email, password);
                    console.log('[AUTH] Signin success:', userCredential.user.uid);
                }
            } catch (error) {
                console.error('[AUTH] Failure:', error.code, error.message);
                showToast(error.message, 'error');
                btnText.textContent = originalText;
                authSubmitBtn.disabled = false;
            }
        });
    }

    // 4. Google Sign In
    if (googleBtn) {
        googleBtn.addEventListener('click', async () => {
            console.log('Google login clicked');
            const provider = new GoogleAuthProvider();
            try {
                await signInWithPopup(auth, provider);
            } catch (error) {
                console.error('Google Auth Error:', error);
                showToast(error.message, 'error');
            }
        });
    }

    // 5. Navigation & UI Toggles
    if (signinTab && signupTab) {
        signinTab.addEventListener('click', () => setAuthMode('signin'));
        signupTab.addEventListener('click', () => setAuthMode('signup'));
    }

    function setAuthMode(mode) {
        authModeInput.value = mode;
        const btnText = authSubmitBtn.querySelector('span');
        const footer = document.querySelector('.login-footer');

        if (mode === 'signin') {
            signinTab.classList.add('active');
            signupTab.classList.remove('active');
            btnText.textContent = 'Sign In';
            if (footer) footer.style.display = 'block';
            if (forgotPasswordBtn) forgotPasswordBtn.parentElement.style.display = 'block';
        } else {
            signupTab.classList.add('active');
            signinTab.classList.remove('active');
            btnText.textContent = 'Create Account';
            if (footer) footer.style.display = 'none';
            if (forgotPasswordBtn) forgotPasswordBtn.parentElement.style.display = 'none';
        }
    }

    // 6. Forgot Password
    if (forgotPasswordBtn) {
        const modal = document.getElementById('forgot-password-modal');
        const closeBtn = document.getElementById('close-forgot-modal');
        const cancelBtn = document.getElementById('cancel-forgot');
        const forgotForm = document.getElementById('forgot-password-form');

        const closeModal = () => modal.style.display = 'none';

        forgotPasswordBtn.addEventListener('click', (e) => {
            e.preventDefault();
            modal.style.display = 'flex';
        });

        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

        if (forgotForm) {
            forgotForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('forgot-email').value;
                const btn = forgotForm.querySelector('button[type="submit"]');
                const originalText = btn.textContent;

                try {
                    btn.textContent = 'Sending...';
                    btn.disabled = true;
                    await sendPasswordResetEmail(auth, email);
                    showToast('Password reset link sent!', 'success');
                    closeModal();
                } catch (error) {
                    showToast(error.message, 'error');
                } finally {
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
            });
        }
    }

    // 7. Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                console.log('Logging out...');
                await signOut(auth);
                localStorage.removeItem('userType');
                window.location.href = 'index.html';
            } catch (error) {
                console.error('Logout Error:', error);
            }
        });
    }

    // --- Dashboard Logic ---

    const db = window.firebaseDB;

    // 1. Add Expense
    const expenseForm = document.getElementById('expense-form');
    if (expenseForm) {
        expenseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = expenseForm.querySelector('button[type="submit"]');
            const originalHTML = submitBtn.innerHTML;

            try {
                const user = auth.currentUser;
                const userType = localStorage.getItem('userType');

                if (!user && userType !== 'guest') {
                    throw new Error('Not authorized to add expenses.');
                }

                submitBtn.disabled = true;
                submitBtn.textContent = 'Saving...';

                const date = document.getElementById('expense-date').value;
                const category = document.getElementById('expense-category').value;
                const description = document.getElementById('expense-description').value;
                const amount = parseFloat(document.getElementById('expense-amount').value);
                const transactionId = document.getElementById('expense-transaction-id').value;

                if (!amount || amount <= 0) throw new Error('Valid amount required.');

                checkMonthlyLimit(amount);

                if (user) {
                    await addDoc(collection(db, 'users', user.uid, 'expenses'), {
                        date, category, description, amount, transactionId, createdAt: new Date()
                    });
                } else {
                    throw new Error('You must be signed in (Guest or User) to save expenses.');
                }

                showToast('Expense saved!', 'success');
                expenseForm.reset();
                document.getElementById('expense-date').valueAsDate = new Date();

            } catch (error) {
                console.error('Save Error:', error);
                showToast(error.message, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalHTML;
            }
        });
    }

    // --- Smart Analyzer Logic ---
    const analyzeBtn = document.getElementById('analyze-btn');
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', () => {
            const input = document.getElementById('analyzer-input').value;
            if (!input) {
                showToast('Please paste a message first', 'error');
                return;
            }

            console.log('Analyzing message...');

            // Regex patterns
            const amountRegex = /(?:rs\.?|inr|₹)\s*([\d,]+\.?\d*)/i;
            const utrRegex = /(?:utr|txn|transaction|id)\s*(?:no\.?|[:\-])?\s*([a-z0-9]+)/i;
            const dateRegex = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/;

            const amountMatch = input.match(amountRegex);
            const utrMatch = input.match(utrRegex);
            const dateMatch = input.match(dateRegex);

            if (amountMatch) {
                const amount = amountMatch[1].replace(/,/g, '');
                document.getElementById('expense-amount').value = amount;
                console.log('Extracted Amount:', amount);
            }

            if (utrMatch) {
                const utr = utrMatch[1];
                document.getElementById('expense-transaction-id').value = utr;
                console.log('Extracted UTR:', utr);
            }

            if (dateMatch) {
                // Simple attempt to format date for input[type=date] (YYYY-MM-DD)
                try {
                    const d = new Date(dateMatch[1]);
                    if (!isNaN(d.getTime())) {
                        document.getElementById('expense-date').valueAsDate = d;
                        console.log('Extracted Date:', dateMatch[1]);
                    }
                } catch (e) { }
            }

            showToast('Message analyzed successfully!', 'info');
        });
    }

    // 2. Load Firestore Expenses
    function loadExpenses() {
        const user = auth.currentUser;
        if (!user) return;

        clearSubscriptions(); // Safety check

        console.log('Subscribing to Firestore expenses...');
        const q = query(
            collection(db, 'users', user.uid, 'expenses'),
            orderBy('date', 'desc')
        );

        const unsubExpenses = onSnapshot(q, (snapshot) => {
            expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderExpenses();
            updateStats();
        }, (err) => {
            console.error('Firestore Error (Expenses):', err);
            showToast('Sync error', 'error');
        });

        // Sync Monthly Limit from Firestore
        const unsubLimit = onSnapshot(doc(db, 'users', user.uid, 'settings', 'budget'), (docSnap) => {
            if (docSnap.exists()) {
                monthlyLimit = docSnap.data().limit || 0;
                localStorage.setItem('monthlyLimit', monthlyLimit);
                updateStats();
                console.log('Cloud limit synced:', monthlyLimit);
            }
        }, (err) => {
            console.error('Firestore Error (Limit):', err);
        });

        activeSubscriptions.push(unsubExpenses, unsubLimit);
    }

    // 3. UI Helpers
    function renderExpenses() {
        const tbody = document.getElementById('expenses-tbody');
        const mobileList = document.getElementById('expenses-list-mobile');
        const recentList = document.getElementById('recent-expenses-list');
        const noExpensesMsg = document.getElementById('no-expenses-message');

        if (!tbody && !recentList) return;

        if (!expenses || expenses.length === 0) {
            if (noExpensesMsg) noExpensesMsg.style.display = 'flex';
            if (tbody) tbody.innerHTML = '';
            if (mobileList) mobileList.innerHTML = '';
            if (recentList) {
                recentList.innerHTML = `<div class="empty-state"><p>No expenses yet</p></div>`;
            }
            return;
        }

        if (noExpensesMsg) noExpensesMsg.style.display = 'none';

        const rowsHTML = expenses.map(exp => `
            <tr>
                <td>${formatDate(exp.date)}</td>
                <td class="category-cell"><span class="category-badge ${exp.category}">${getCategoryIcon(exp.category)} ${exp.category}</span></td>
                <td>${exp.description}</td>
                <td class="amount-cell">₹${exp.amount.toFixed(2)}</td>
                <td class="actions-cell"><button class="action-btn delete-btn" data-id="${exp.id}">🗑️</button></td>
            </tr>
        `).join('');

        if (tbody) {
            tbody.innerHTML = rowsHTML;
            tbody.querySelectorAll('.delete-btn').forEach(btn => {
                btn.onclick = () => confirmAndExitDelete(btn.dataset.id);
            });
        }

        if (mobileList) {
            mobileList.innerHTML = expenses.map(exp => `
                <div class="expense-card glass-card">
                    <div class="expense-header">
                        <span class="category-badge ${exp.category}">${getCategoryIcon(exp.category)}</span>
                        <span>₹${exp.amount.toFixed(2)}</span>
                    </div>
                    <div class="expense-body"><h3>${exp.description}</h3><p>${formatDate(exp.date)}</p></div>
                    <div class="expense-actions"><button class="delete-btn" data-id="${exp.id}">Delete</button></div>
                </div>
            `).join('');
            mobileList.querySelectorAll('.delete-btn').forEach(btn => {
                btn.onclick = () => confirmAndExitDelete(btn.dataset.id);
            });
        }

        if (recentList) {
            recentList.innerHTML = expenses.slice(0, 5).map(exp => `
                <div class="recent-item">
                    <div class="recent-icon ${exp.category}">${getCategoryIcon(exp.category)}</div>
                    <div class="recent-details"><h4>${exp.description}</h4><span>${formatDate(exp.date)}</span></div>
                    <div class="recent-amount">-₹${exp.amount.toFixed(2)}</div>
                </div>
            `).join('');
        }
    }

    function updateStats() {
        const totalEl = document.getElementById('total-expenses');
        if (!totalEl) return;

        const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);
        const now = new Date();
        const monthTotal = expenses.filter(exp => {
            const d = new Date(exp.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }).reduce((sum, exp) => sum + exp.amount, 0);

        totalEl.textContent = `₹${total.toFixed(2)}`;
        const monthEl = document.getElementById('month-expenses');
        if (monthEl) monthEl.textContent = `₹${monthTotal.toFixed(2)}`;
        const countEl = document.getElementById('expense-count');
        if (countEl) countEl.textContent = expenses.length;
        const avgEl = document.getElementById('avg-expense');
        if (avgEl) avgEl.textContent = `₹${(expenses.length ? total / expenses.length : 0).toFixed(2)}`;

        updateLimitStatus(monthTotal);

        // Sync dedicated limit page display
        const limitDisplayVal = document.getElementById('current-limit-val');
        if (limitDisplayVal) limitDisplayVal.textContent = `₹${parseFloat(monthlyLimit).toFixed(2)}`;
    }

    function confirmAndExitDelete(id) {
        if (confirm('Delete this expense?')) {
            const user = auth.currentUser;
            if (user) {
                deleteDoc(doc(db, 'users', user.uid, 'expenses', id));
            } else {
                expenses = expenses.filter(e => e.id !== id);
                localStorage.setItem('guest_expenses', JSON.stringify(expenses));
                renderExpenses();
                updateStats();
            }
        }
    }

    function checkMonthlyLimit(newAmount) {
        if (monthlyLimit <= 0) return;
        const total = expenses.filter(exp => {
            const d = new Date(exp.date);
            const now = new Date();
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }).reduce((sum, exp) => sum + exp.amount, 0) + newAmount;

        if (total > monthlyLimit) {
            const msg = `[Alert] Exceeded limit ₹${monthlyLimit}. Total: ₹${total.toFixed(2)}`;
            console.log('Sending mock SMS:', msg);
            setTimeout(() => alert(`📱 SMS:\n${msg}`), 500);
        }
    }

    function updateLimitStatus(total) {
        const monthCard = document.querySelector('.stat-month');
        if (!monthCard) return;
        monthCard.classList.remove('limit-warning', 'limit-exceeded');
        if (monthlyLimit <= 0) return;
        const perc = (total / monthlyLimit) * 100;
        if (perc >= 100) monthCard.classList.add('limit-exceeded');
        else if (perc >= 80) monthCard.classList.add('limit-warning');
    }

    function showToast(msg, type = 'info') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.querySelector('.toast-message').textContent = msg;
        toast.className = `toast show ${type}`;
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    function formatDate(d) { return new Date(d).toLocaleDateString(); }
    function getCategoryIcon(cat) {
        const i = { food: '🍔', transport: '🚗', shopping: '🛍️', bills: '📱', health: '💊', other: '📦' };
        return i[cat] || '📦';
    }

    // --- Monthly Limit Logic ---
    window.saveMonthlyLimit = function (isFromPage = false) {
        const inputId = isFromPage ? 'page-limit-amount-input' : 'limit-amount-input';
        const input = document.getElementById(inputId);
        if (!input) return;

        const amount = parseFloat(input.value);

        if (isNaN(amount) || amount < 0) {
            showToast('Please enter a valid amount', 'error');
            return;
        }

        monthlyLimit = amount;
        localStorage.setItem('monthlyLimit', amount);

        const user = auth.currentUser;
        if (user) {
            // Save to Firestore for logged-in users
            const { setDoc } = window.firebaseModules || {};
            if (setDoc) {
                setDoc(doc(db, 'users', user.uid, 'settings', 'budget'), { limit: amount }, { merge: true })
                    .catch(e => console.error('Limit Cloud Save Error:', e));
            } else {
                // Fallback if setDoc is missing from destructuring (shouldn't happen with our recent fix)
                updateDoc(doc(db, 'users', user.uid, 'settings', 'budget'), { limit: amount })
                    .catch(() => {
                        const { setDoc: sd } = window.firebaseModules; // try direct
                        if (sd) sd(doc(db, 'users', user.uid, 'settings', 'budget'), { limit: amount }, { merge: true });
                    });
            }
        }

        const modal = document.getElementById('limit-modal');
        if (modal) modal.style.display = 'none';

        updateStats();
        showToast('Monthly limit updated!', 'success');
        console.log('Monthly limit set to:', amount);

        if (isFromPage) {
            // Optional: return to dashboard or stay on page
            input.value = '';
        }
    };

    console.log('App initialization scripts loaded.');
});
