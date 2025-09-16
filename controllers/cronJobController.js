const CustomerStatusCronService = require('../services/CustomerStatusCronService');

class CronJobController {
    constructor() {
        this.cronService = new CustomerStatusCronService();
    }

    // Manual trigger for all users
    triggerStatusUpdate = async (req, res) => {
        try {
            const authenticatedUser = req.user;

            
            // Process all users - no userId filter
            const result = await this.cronService.triggerStatusUpdate(null);
            
            return res.json({
                success: true,
                message: 'Customer status update completed successfully for ALL USERS',
                data: {
                    triggeredBy: authenticatedUser?.email || 'unknown',
                    mode: 'PRODUCTION',
                    scope: 'ALL USERS',
                    results: {
                        processed: result.processed,
                        updated: result.updated,
                        statusCounts: {
                            new: result.new,
                            active: result.active,
                            at_risk: result.at_risk,
                            lost: result.lost,
                            recovered: result.recovered
                        },
                        errors: result.errors
                    },
                    details: result.details.filter(d => d.changed) // Only show changed statuses
                }
            });
        } catch (error) {
            console.error('Error triggering status update:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to trigger status update',
                error: error.message
            });
        }
    }

}

module.exports = new CronJobController();
