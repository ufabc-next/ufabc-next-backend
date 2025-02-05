import {
  type InferSchemaType,
  Schema,
  model,
} from 'mongoose';

const userSchema = new Schema(
  {
    ra: {
      type: Number,
      unique: true,
      partialFilterExpression: { ra: { $exists: true } },
      default: null,
    },
    email: {
      type: String,
      unique: true,
      partialFilterExpression: { email: { $exists: true } },
      default: null,
    },
    confirmed: {
      type: Boolean,
      default: false,
    },
    active: {
      type: Boolean,
      default: true,
    },
    oauth: {
      facebook: String,
      emailFacebook: String,
      google: String,
      emailGoogle: String,
      email: String,
      picture: String,
    },
    devices: [
      {
        phone: {
          type: String,
          required: true,
        },
        token: {
          type: String,
          required: true,
        },
        deviceId: {
          type: String,
          required: true,
        },
      },
    ],
    permissions: { type: [String], default: [] },
  },
  {
    methods: {
      addDevice(device: (typeof this.devices)[number]) {
        this.devices.unshift(device);

        const uniqueDevices = [];
        const uniqueDeviceIds = new Set<string>();
        for (const device of this.devices) {
          if (!uniqueDeviceIds.has(device.id)) {
            uniqueDevices.push(device);
            uniqueDeviceIds.add(device.deviceId);
          }
        }

        this.devices = uniqueDevices as typeof this.devices;
      },
      removeDevice(deviceId: string) {
        this.devices = this.devices.filter(
          (device) => device.deviceId !== deviceId,
        ) as typeof this.devices;
      },
    },
    timestamps: true,
  },
);

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = ReturnType<(typeof UserModel)['hydrate']>;
export const UserModel = model('users', userSchema);
