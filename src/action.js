const axios = require("axios");
const core = require("@actions/core");

const PROJECT_NAME = core.getInput("project-name") || "cam-code";
const REPO_URL = core.getInput("current-repo-url") || 'https://github.com/Varcode-STMS/cam-code/';
const COMPOSE_FILE = core.getInput("docker-compose-file-name") || "docker-compose.yml";
const ENV = []
const BRANCH_NAME_REF = core.getInput('branch-ref') || "refs/heads/dev";
const GIT_USER = core.getInput("git-user") || "amooney-varcode";
const GIT_TOKEN = core.getInput("git-token");

const baseURL = core.getInput("deployment-env");
// must run npm build before any push to master
let api;
let stackConfig = {};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

const getCurrentStack = async() => {
    try {
        console.log("initiating delete");
        const {data: getStacks} = await api.get("/stacks?filters=%7B%22EndpointID%22:2,%22IncludeOrphanedStacks%22:true%7D");
        const currentStackConfig =  getStacks.find(stack => stack.Name === PROJECT_NAME);
        if(currentStackConfig){
            stackConfig = currentStackConfig;
        }
        return true;
    } catch (error) {
      console.log(error?.response?.data);
      console.log(error?.response?.status);
      console.log(error?.response?.headers);
      return false;
    }
  
}
const connect = async() => {
    try {
        const {data: getJWToken} = await axios.post(`${baseURL}/auth`,{
            "password": "HelpIneed2021",
            "username": "admin"
        });

        const {jwt} = getJWToken;
        api = axios.create({
            baseURL,
            headers: {
                Authorization: `Bearer ${jwt}`
            }
        });

        console.log("github token:", GIT_TOKEN);
        console.log("connected to portainer#@!");
    } catch (error) {
        console.log(error?.response?.data);
        console.log(error?.response?.status);
        console.log(error?.response?.headers);
    }
}

const killDockerEndPoints = async() => {
    const {data: allDockerEndPoints} = await api.get("/endpoints/2/docker/containers/json?all=true");
    const result = allDockerEndPoints.map(({Labels, Id}) => {
        if(Labels["com.docker.compose.project"] === PROJECT_NAME){
            console.log("killing container", Id);
            return api.delete(`/endpoints/2/docker/containers/${Id}?v=0&force=true`);
        }
        return true;
    });
    return Promise.allSettled(result);
}

const deleteImages = async() => {
    try {
        console.log("deleting images...");
        const {data: allImages} =  await api.get('/endpoints/2/docker/images/json?all=0')
        const result = allImages.map(async({Id, RepoTags}) => {
            if(RepoTags.find(tag => tag.includes(PROJECT_NAME))){
                console.log("deleting image", Id);
                return await api.delete(`/endpoints/2/docker/images/${Id}`)
            }
        });
        return await Promise.allSettled(result);
    } catch (error) {
        console.log("error deleting image");
        console.log(error?.response?.data);
        console.log(error?.response?.status);
    }
}

const redeployStack = async() => {
    try {
        console.log("redeploying stack...");
        await api.put(`/stacks/${stackConfig?.Id}/git/redeploy?endpointId=2`,{
            Env: stackConfig?.Env || ENV,
            prune: false,
            ComposeFile: COMPOSE_FILE,
            repositoryAuthentication: true,
            repositoryReferenceName: stackConfig?.GitConfig?.ReferenceName || BRANCH_NAME_REF,
            repositoryUsername: GIT_USER,
            repositoryPassword: GIT_TOKEN
        });
        console.log("stack deployed!");
    } catch (error) {
      console.log(error?.response?.data);
      console.log(error?.response?.status);
      console.log(error?.response?.headers);
      throw new Error("error redeploying stack");
    }
}

// const deleteStack = async() => {
//     try {
//         const stackIdToDelete = currentStackConfig?.Id;
//         if(stackIdToDelete){
//             try {
//                 console.log(stackConfig);
//                 console.log("Stopping stack...")
//                 await api.post(`/stacks/${stackIdToDelete}/stop`);
//                 sleep(1000);
//                 console.log("deleting stack", stackIdToDelete);
//                 const {data: deleteStack} = await api.delete(`/stacks/${stackIdToDelete}?endpointId=2&external=false`);
//                 console.log(deleteStack);
//             } catch (error) {
//                 console.log(error);
//                 await killDockerEndPoints()
//             }
//         }
//         const {data:Images} = await api.get("/endpoints/2/docker/images/json?all=0");
//         const removeImages = Images.map(image =>{
//             if(image.RepoTags.find(tag => tag.includes(PROJECT_NAME))){
//             console.log("deleting image", image.Id);
//             return api.delete(`/endpoints/2/docker/images/${image.Id}?force=false`);
//             }
//             return Promise.resolve();
//         });
//         await Promise.allSettled(removeImages);

//     } catch (error) {
//         console.log(error);
//       console.log(error?.response?.data);
//       console.log(error?.response?.status);
//       console.log(error?.response?.headers);
//       if(error?.response?.data?.message?.includes("stop") || error?.response?.data?.message?.includes("Removing")){
//         console.log("stack is stopping, waiting 6 seconds");
//         await sleep(6000);
//         await deleteStack();
//       }
//     }
// }

// const createStack = async() => {
//     try {
//         console.log("creating stack...");
//         await api.post("/stacks?method=repository&type=2&endpointId=2",{
//             Name:PROJECT_NAME,
//             RepositoryURL: stackConfig?.GitConfig?.URL || REPO_URL,
//             ComposeFile: stackConfig?.GitConfig?.ConfigFilePath || COMPOSE_FILE,
//             Env: stackConfig?.Env || ENV,
//             repositoryAuthentication: true,
//             repositoryReferenceName: stackConfig?.GitConfig?.ReferenceName || BRANCH_NAME_REF,
//             repositoryUsername: "VerioN1"
//         });
//         console.log("stack deployed!");
//     } catch (error) {
//       console.log(error.response.data);
//       console.log(error.response.status);
//       console.log(error.response.headers);
//     }
// }

const main = async() => {
    console.log('Target Project:', PROJECT_NAME)
    await connect();
    const shouldContinue = await getCurrentStack()
    if(!shouldContinue){
        console.log("stack not found, exiting");
        return;
    }
    await killDockerEndPoints()
    await sleep(1000)
    await deleteImages();
    console.log("done deleting images");
    await sleep(4000)
    await redeployStack();
};
main();
