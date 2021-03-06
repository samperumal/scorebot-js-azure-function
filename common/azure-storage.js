const {
    Aborter,
    AppendBlobURL,
    BlobURL,
    BlockBlobURL,
    ContainerURL,
    ServiceURL,
    StorageURL,
    SharedKeyCredential
} = require("@azure/storage-blob");

function getContainerUrl(config) {
    const sharedKeyCredential = new SharedKeyCredential(config.azure_account, config.azure_account_key);
    const pipeline = StorageURL.newPipeline(sharedKeyCredential);
    const serviceURL = new ServiceURL(
        `https://${config.azure_account}.blob.core.windows.net`,
        pipeline
    );

    return [serviceURL, ContainerURL.fromServiceURL(serviceURL, config.containerName)];
}

exports.getBlob = async function (config) {
    const [serviceURL, containerURL] = getContainerUrl(config);
    const blobURL = BlobURL.fromContainerURL(containerURL, config.blobName);

    let downloadBlockBlobResponse;
    try {
        downloadBlockBlobResponse = await blobDownload(serviceURL, config.containerName, config.blobName)
    }
    catch (err) {
        console.log("Caught in catch 1: ", err.message);
        const content = config.default();
        const contentString = JSON.stringify(content);
        const blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);
        await blockBlobURL.upload(
            Aborter.none,
            contentString,
            contentString.length
        );

        downloadBlockBlobResponse = await blobDownload(serviceURL, config.containerName, config.blobName);
    }

    // Get blob content from position 0 to the end
    const blobString = await streamToString(downloadBlockBlobResponse.readableStreamBody);

    return JSON.parse(blobString);
}

exports.putBlob = async function (config, content) {
    const [serviceURL, containerURL] = getContainerUrl(config);
    const blobURL = BlobURL.fromContainerURL(containerURL, config.blobName);
    const blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);

    const contentString = JSON.stringify(content);

    return await blockBlobURL.upload(
        Aborter.none,
        contentString,
        contentString.length
    );
}

exports.appendBlob = async function(config, content) {
    const [serviceURL, containerURL] = getContainerUrl(config);
    const blobURL = BlobURL.fromContainerURL(containerURL, config.blobName);
    const blockBlobURL = AppendBlobURL.fromBlobURL(blobURL);

    const contentString = JSON.stringify(content) + ",\n";

    return await blockBlobURL.appendBlock(
        Aborter.none,
        contentString,
        contentString.length
    );
}

async function blobDownload(serviceURL, containerName, blobName) {
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);
    const blobURL = BlobURL.fromContainerURL(containerURL, blobName);

    return blobURL.download(Aborter.none, 0);
}

// A helper method used to read a Node.js readable stream into string
async function streamToString(readableStream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        readableStream.on("data", data => {
            chunks.push(data.toString());
        });
        readableStream.on("end", () => {
            resolve(chunks.join(""));
        });
        readableStream.on("error", reject);
    });
}

