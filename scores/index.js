module.exports = async function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.');

    const response_body = {
        response_type: "ephemeral",
        text: "Error running task: "
    };

    if (req.body != "") {
        const { parse } = require('querystring');
        const parameters = parse(req.body);
        //console.log(JSON.stringify(parameters), null, "\t")
        if (parameters.token != process.env["slack_token"]) {
            response_body.text += ` ${parameters.token} != ${process.env["slack_token"]}`;
        }
        else if (parameters.team_id != process.env["team_id"]) {
            response_body.text += ` ${parameters.token} != ${process.env["team_id"]}`;
        }
        else {
            const re = /<(@\w+)([|]\w+)?/;

            const match = re.exec(parameters.text);

            if (match != null && match.length > 1 && match[1] != null) {
                const user = parameters.user_id;
                const player = match[1];
                response_body.text = `<@${user}> requested scores for <${player}>`;
            }
            else response_body.text += ` ${parameters.text}`;
        }
    }

    context.res = {
        headers: {
            'Content-Type': "application/json"
        },
        body: response_body
    };
};