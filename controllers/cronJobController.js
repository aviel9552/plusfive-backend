const CustomerStatusService = require('../services/CustomerStatusService');

class CronJobController {
    constructor() {
        this.customerStatusService = new CustomerStatusService();
    }

    // Manual trigger for all users
    triggerStatusUpdate = async (req, res) => {
        try {
            const authenticatedUser = req.user;

            // Process all users - no userId filter
            const result = await this.customerStatusService.processAllCustomerStatuses(null);
            
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
                    }
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
