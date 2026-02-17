/**
 * Message Queue Client
 */

import amqp from 'amqplib';
import { logger } from './utils/logger.js';

export class MessageQueue {
  private url: string;
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;

  constructor(url: string) {
    this.url = url;
  }

  async connect(): Promise<void> {
    try {
      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createChannel();
      
      await this.channel.assertExchange('odds', 'topic', { durable: true });
      await this.channel.assertExchange('arbitrage', 'topic', { durable: true });
      await this.channel.assertExchange('notifications', 'fanout', { durable: true });

      logger.info('Connected to RabbitMQ');
    } catch (error) {
      logger.error('Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
    logger.info('Disconnected from RabbitMQ');
  }

  async publish(routingKey: string, message: any): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    const exchange = routingKey.split('.')[0];
    const buffer = Buffer.from(JSON.stringify(message));
    
    this.channel.publish(exchange, routingKey, buffer, {
      persistent: true,
      timestamp: Date.now()
    });
  }

  async subscribe(queueName: string, routingKey: string, handler: (msg: any) => Promise<void>): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    const exchange = routingKey.split('.')[0];
    
    await this.channel.assertQueue(queueName, { durable: true });
    await this.channel.bindQueue(queueName, exchange, routingKey);

    await this.channel.consume(queueName, async (msg) => {
      if (msg) {
        try {
          const content = JSON.parse(msg.content.toString());
          await handler(content);
          this.channel!.ack(msg);
        } catch (error) {
          logger.error('Error processing message:', error);
          this.channel!.nack(msg, false, false);
        }
      }
    });

    logger.info(`Subscribed to ${routingKey} on queue ${queueName}`);
  }
}