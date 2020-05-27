const {
    appendBlob
} = require("../common/azure-storage");

module.exports = async function (context, req) {

    const config = {
        azure_account: process.env["azure_account"],
        azure_account_key: process.env["azure_account_key"],
        containerName: "covid",
        blobName: "log.json",
        default: () => ([]),
    };

    try{
        const data = {
            date: new Date().toISOString(),
            req: req
        }

        await appendBlob(config, data);

        context.log('JavaScript HTTP trigger function processed a request.');

        context.res = {
            // status: 200, /* Defaults to 200 */
            body: "Success"
        };
    }
    catch (error) {
        context.res = {
            status: 500,
            body: "Error:"
        };
    }
}