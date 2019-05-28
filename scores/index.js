module.exports = async function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.');

    context.res = {
        headers: {
            'Content-Type': "application/json"
        },
        body: {
            response_type: "in_channel",
            text: "Hello World!"
        }
    };
};