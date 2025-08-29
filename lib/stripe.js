const Stripe = require('stripe');

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
});

/**
 * Get all available Stripe prices
 */
const getStripePrices = async () => {
  try {
    const prices = await stripe.prices.list({
      active: true,
      expand: ['data.product'],
    });
    
    return prices.data.map(price => ({
      id: price.id,
      unit_amount: price.unit_amount,
      currency: price.currency,
      recurring: price.recurring,
      product: price.product,
    }));
  } catch (error) {
    console.error('Error fetching Stripe prices:', error);
    throw error;
  }
};

/**
 * Find Stripe customer by email
 */
const findStripeCustomerByEmail = async (email) => {
  try {
    const customers = await stripe.customers.list({
      email,
      limit: 1,
    });
    
    return customers.data.length > 0 ? customers.data[0] : null;
  } catch (error) {
    console.error('Error finding Stripe customer by email:', error);
    return null;
  }
};

/**
 * Create or retrieve Stripe customer
 */
const getOrCreateStripeCustomer = async (email, userId) => {
  try {
    // First, try to find existing customer
    let customer = await findStripeCustomerByEmail(email);
    
    if (!customer) {
      // Create new customer if not found
      customer = await stripe.customers.create({
        email,
        metadata: {
          userId: userId,
        },
      });
    } else if (customer.metadata.userId !== userId) {
      // Update metadata if customer exists but userId is different
      customer = await stripe.customers.update(customer.id, {
        metadata: {
          ...customer.metadata,
          userId: userId,
        },
      });
    }
    
    return customer;
  } catch (error) {
    console.error('Error getting/creating Stripe customer:', error);
    throw error;
  }
};

module.exports = {
  stripe,
  getStripePrices,
  findStripeCustomerByEmail,
  getOrCreateStripeCustomer,
};
