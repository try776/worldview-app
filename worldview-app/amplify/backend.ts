// amplify/backend.ts
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { syncFlights } from './functions/syncFlights/resource';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Duration } from 'aws-cdk-lib';

const backend = defineBackend({
  auth,
  data,
  syncFlights
});

// 1. IAM Berechtigungen: Lambda darf auf die Flight-Tabelle zugreifen
backend.syncFlights.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['dynamodb:PutItem', 'dynamodb:Scan', 'dynamodb:DeleteItem'],
    resources: [backend.data.resources.tables['Flight'].tableArn]
  })
);

// 2. Umgebungsvariable: Lambda weiß, wie die Tabelle in DynamoDB genau heißt
backend.syncFlights.addEnvironment(
  'AMPLIFY_DATA_FLIGHT_TABLE_NAME', 
  backend.data.resources.tables['Flight'].tableName
);

// 3. AWS EventBridge Cronjob: Startet die Lambda alle 2 Minuten
const cronStack = backend.createStack('CronStack');
const rule = new events.Rule(cronStack, 'SyncFlightsRule', {
  schedule: events.Schedule.rate(Duration.minutes(2)),
});

rule.addTarget(new targets.LambdaFunction(backend.syncFlights.resources.lambda));