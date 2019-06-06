const {
    getBlob,
    putBlob
} = require("../common/azure-storage");

const axios = require('axios');

const resources = [
    "tr",
    "money",
    "iron",
    "titanium",
    "greenery",
    "power",
    "heat",
    "cards"
];

function timing() {
    const d = new Date();
    return d.getSeconds() * 1000 + d.getMilliseconds();
}

module.exports = async function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.');

    const response_body = {
        response_type: "ephemeral",
        text: `Start: ${timing()}\n`
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

        const start = timing();

        const config = {
            azure_account: process.env["azure_account"],
            azure_account_key: process.env["azure_account_key"],
            containerName: process.env["azure_container"],
            blobName: parameters.channel_id,
            default: () => ([]),
        };

        const game_data_blob = await getBlob(config);

        const game_data = JSON.parse(game_data_blob);

        const re = /^ *<(@\w+)(?:[|]\w+)?> (.+)?$/;
        const deltaRe = /([A-Za-z$]+) *: *(\d+)/;

        const playerMatch = re.exec(parameters.text);

        if (playerMatch != null && playerMatch.length > 1 && playerMatch[1] != null) {
            const user = parameters.user_id;
            const player = playerMatch[1];
            const command = playerMatch[2];

            if (command != null) {
                for (const action of command.split(",")) {
                    const deltaMatch = action.match(deltaRe);
                    if (deltaMatch != null && deltaMatch.length == 3) {
                        const prop = deltaMatch[1];
                        const val = deltaMatch[2];
                        game_data.push([player, prop, val]);
                    }
                }

                delayedResponse(parameters.response_url, putBlob.bind(null, config, game_data));
            }
            else {
                response_body.text += `<@${user}> requested scores for <${player}>\n`;
            }
        }

        response_body.text += `${start} to ${timing()}\n`;

        for (const player_id in game_data) {
            const player = game_data[player_id];
            response_body.text += `<@${player_id}>: ${player.money}\n`;
        }
    }
    else response_body.text += ` ${parameters.text}`;

    response_body.text += `End: ${timing()}\n`;

    context.res = {
        headers: {
            'Content-Type': "application/json"
        },
        body: response_body
    };
}

async function delayedResponse(url, fn) {
    try {
        const ret = await fn();

        const res = await axios
            .post(url, {
                text: 'Content updated'
            });

        console.log(`statusCode: ${res.status}`);
        //console.log(res);
    }
    catch (error) {
        console.error(error)
    }
}