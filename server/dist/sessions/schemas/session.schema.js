"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceSessionSchema = exports.DeviceSession = exports.DeviceMode = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
var DeviceMode;
(function (DeviceMode) {
    DeviceMode["IDLE"] = "IDLE";
    DeviceMode["ADD"] = "ADD";
    DeviceMode["CHECK"] = "CHECK";
    DeviceMode["CHECKOUT"] = "CHECKOUT";
    DeviceMode["PAYMENT"] = "PAYMENT";
})(DeviceMode || (exports.DeviceMode = DeviceMode = {}));
let DeviceSession = class DeviceSession extends mongoose_2.Document {
    deviceId;
    currentMode;
    activeProductId;
    lastScanData;
    lastScanStatus;
    lastCapturedAt;
    currentBasketId;
    lastBasketKey;
    lastBasketSeenAt;
};
exports.DeviceSession = DeviceSession;
__decorate([
    (0, mongoose_1.Prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], DeviceSession.prototype, "deviceId", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        type: String,
        enum: Object.values(DeviceMode),
        default: DeviceMode.IDLE,
    }),
    __metadata("design:type", String)
], DeviceSession.prototype, "currentMode", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Schema.Types.ObjectId, ref: 'Product' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], DeviceSession.prototype, "activeProductId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [String], default: [] }),
    __metadata("design:type", Array)
], DeviceSession.prototype, "lastScanData", void 0);
__decorate([
    (0, mongoose_1.Prop)({ enum: ['IDLE', 'SCANNING', 'STABLE'], default: 'IDLE' }),
    __metadata("design:type", String)
], DeviceSession.prototype, "lastScanStatus", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], DeviceSession.prototype, "lastCapturedAt", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], DeviceSession.prototype, "currentBasketId", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], DeviceSession.prototype, "lastBasketKey", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], DeviceSession.prototype, "lastBasketSeenAt", void 0);
exports.DeviceSession = DeviceSession = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], DeviceSession);
exports.DeviceSessionSchema = mongoose_1.SchemaFactory.createForClass(DeviceSession);
//# sourceMappingURL=session.schema.js.map