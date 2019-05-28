const {
    getBlob
} = require("../common/azure-storage");

module.exports = async function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.');

    const response_body = {
        response_type: "ephemeral",
        text: ""
    };

    if (req.body != "") {
        const { parse } = require('querystring');
        const parameters = parse(req.body);

        if (parameters.token != process.env["slack_token"]) {
            response_body.text += `Error: ${parameters.token} != ${process.env["slack_token"]}`;
        }
        if (parameters.team_id != process.env["team_id"]) {
            response_body.text += `Error: ${parameters.token} != ${process.env["team_id"]}`;
        }

        const re = /<(@\w+)([|]\w+)?/;

        const match = re.exec(parameters.text);

        if (match != null && match.length > 1 && match[1] != null) {
            const user = parameters.user_id;
            const player = match[1];
            response_body.text = `<@${user}> requested scores for <${player}>\n`;
        }

        const fn = () => ({});

        const game_data_blob = await getBlob({
            azure_account: process.env["azure_account"],
            azure_account_key: process.env["azure_account_key"],
            containerName: process.env["azure_container"],
            blobName: parameters.channel_id,
            fn: fn,
        });

        const game_data = JSON.parse(game_data_blob);

        for (const player_id in game_data) {
            const player = game_data[player_id];
            response_body.text += `<@${player_id}>: ${player.money}\n`
        }
    }
    else response_body.text += ` ${parameters.text}`;

    context.res = {
        headers: {
            'Content-Type': "application/json"
        },
        body: response_body
    };
}