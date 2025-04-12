export interface DeployInstanceDto {
    name: string;
    installPath: string;
    gamePort: number;
    queryPort: number;
    rconPort: number;
    beaconPort: number;
    rconPassword: string;
    extraArgs?: string;
} 