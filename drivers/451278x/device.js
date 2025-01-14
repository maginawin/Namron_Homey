'use strict';

const {ZigBeeDevice} = require("homey-zigbeedriver");
const {CLUSTER, Cluster} = require('zigbee-clusters')
const moment = require("moment-timezone");

const appkit = require('./lib/');

const destructConstProps = function ({ID, NAME, ATTRIBUTES, COMMANDS}) {
    return Object.freeze({
        ID,
        NAME,
        ATTRIBUTES,
        COMMANDS,
    });
}

const HzcThermostatCluster = require('../../lib/SrThermostatCluster')

const HzcThermostatUserInterfaceConfigurationCluster =
    require('../../lib/SrThermostatUserInterfaceConfigurationCluster')

Cluster.addCluster(HzcThermostatCluster)
Cluster.addCluster(HzcThermostatUserInterfaceConfigurationCluster)

CLUSTER['THERMOSTAT_USER_INTERFACE_CONFIGURATION'] = destructConstProps(HzcThermostatUserInterfaceConfigurationCluster)


const getInt16 = function (number) {
    const int16 = new Int16Array(1)
    int16[0] = number
    return int16[0]
}

const {
    getOptBaseTime, TIP_CHANGED
} = require('./lib/devices/utils');


class t11_zg_thermostat_device extends ZigBeeDevice {


    onEndDeviceAnnounce() {
    }

    onDeleted() {
        super.onDeleted();
    }

    async onNodeInit({zclNode, node}) {
        super.onNodeInit({zclNode: zclNode, node: node})
        this.disableDebug()

        this.meter_multiplier = 0.001;
        this.power_multiplier = 0.1;
        this.target_temp_setpoint_min = 5
        this.target_temp_setpoint_max = 40

        this.absMinHeatSetpointLimit = 5
        this.absMaxHeatSetpointLimit = 35
        this.absMinCoolSetpointLimit = 10
        this.absMaxCoolSetpointLimit = 40

        this.absMinHeatSetpointLimitF = 41
        this.absMaxHeatSetpointLimitF = 95
        this.absMinCoolSetpointLimitF = 50
        this.absMaxCoolSetpointLimitF = 104


        await this._start()
        await this._onHandlerReport()
        await this._setUpMeasureTemperatureCapability()
        await this._setUpMeasureTemperatureFCapability()
    };

    async _start() {
        this.setAvailable().catch(this.error);
        this.unsetWarning().catch(this.error)

        await this.thermostatUserInterfaceConfiguration().readAttributes(['temperatureDisplayMode']).then(async value => {
            if (value.hasOwnProperty('temperatureDisplayMode')) {
                this.log('----------------OOOOOOOOOOtemperatureDisplayModeOOOO', value)
                let mode = value['temperatureDisplayMode'] === 'temperature_display_mode_c' ? 0 : 1
                this.setSettings({temperature_display_mode: (mode).toString()}).catch(this.error)
                this.setStoreValue('temperature_display_mode', mode).catch(this.error)


                await this.thermostatCluster().readAttributes(
                    ['sensorMode', 'systemMode', 'thermostatRunningMode',
                        'absMinHeatSetpointLimit', 'absMaxHeatSetpointLimit',
                        'absMinCoolSetpointLimit', 'absMaxCoolSetpointLimit',
                        'absMinHeatSetpointLimitF', 'absMaxHeatSetpointLimitF',
                        'absMinCoolSetpointLimitF', 'absMaxCoolSetpointLimitF']
                ).then(async value => {
                    this.log(`++++++ APP start thermostat = `, value)

                    if (value.systemMode === 'heat') {

                        if (this.getStoreValue('temperature_display_mode') == 0) {
                            if (value.hasOwnProperty('absMinHeatSetpointLimit')) {
                                this.absMinHeatSetpointLimit = parseFloat((getInt16(value['absMinHeatSetpointLimit']) / 100).toFixed(1))
                                this.target_temp_setpoint_min = this.absMinHeatSetpointLimit
                            }
                            if (value.hasOwnProperty('absMaxHeatSetpointLimit')) {
                                this.absMaxHeatSetpointLimitF = parseFloat((getInt16(value['absMaxHeatSetpointLimit']) / 100).toFixed(1))
                                this.target_temp_setpoint_max = this.absMaxHeatSetpointLimitF
                            }
                        } else {
                            if (value.hasOwnProperty('absMinHeatSetpointLimitF')) {
                                this.absMinHeatSetpointLimitF = parseFloat((getInt16(value['absMinHeatSetpointLimitF']) / 100).toFixed(1))
                                this.target_temp_setpoint_min = this.absMinHeatSetpointLimitF
                            }
                            if (value.hasOwnProperty('absMaxHeatSetpointLimitF')) {
                                this.absMaxHeatSetpointLimitF = parseFloat((getInt16(value['absMaxHeatSetpointLimitF']) / 100).toFixed(1))
                                this.target_temp_setpoint_max = this.absMaxHeatSetpointLimitF
                            }
                        }
                    }

                    if (value.systemMode === 'cool') {
                        if (this.getStoreValue('temperature_display_mode') == 0) {
                            if (value.hasOwnProperty('absMinCoolSetpointLimit')) {
                                this.absMinCoolSetpointLimit = parseFloat((getInt16(value['absMinCoolSetpointLimit']) / 100).toFixed(1))
                                this.target_temp_setpoint_min = this.absMinCoolSetpointLimit
                            }
                            if (value.hasOwnProperty('absMaxCoolSetpointLimit')) {
                                this.absMaxCoolSetpointLimit = parseFloat((getInt16(value['absMaxCoolSetpointLimit']) / 100).toFixed(1))
                                this.target_temp_setpoint_max = this.absMaxCoolSetpointLimit
                            }
                        } else {
                            if (value.hasOwnProperty('absMinCoolSetpointLimitF')) {
                                this.absMinCoolSetpointLimitF = parseFloat((getInt16(value['absMinCoolSetpointLimitF']) / 100).toFixed(1))
                                this.target_temp_setpoint_min = this.absMinCoolSetpointLimitF
                            }
                            if (value.hasOwnProperty('absMaxCoolSetpointLimitF')) {
                                this.absMaxCoolSetpointLimitF = parseFloat((getInt16(value['absMaxCoolSetpointLimitF']) / 100).toFixed(1))
                                this.target_temp_setpoint_max = this.absMaxCoolSetpointLimitF
                            }
                        }
                    }

                    if (value.hasOwnProperty('systemMode')) {
                        this._setModeUI(value['systemMode'])
                    }

                    if (value.hasOwnProperty('thermostatRunningMode')) {
                        this._setModeUI(value['thermostatRunningMode'])
                    }

                    if (value.hasOwnProperty('sensorMode')) {
                        let sensorMode = value['sensorMode'] || 'a'
                        this.setStoreValue('sensor_mode', sensorMode)
                        this.setSettings({sensor_mode: sensorMode})
                        await this._initUiModule();
                    }
                }).catch(this.error)
            }
        }).catch(this.error)
    }

    //init UI component module
    async _initUiModule() {

        try {
            let reg_mode = this.getStoreValue('sensor_mode') || 'a';
            if (!this.hasCapability('onoff')) {
                await this.addCapability("onoff");
            }
            if (!this.hasCapability('measure_power')) {
                await this.addCapability("measure_power");
            }
            if (!this.hasCapability('meter_power')) {
                await this.addCapability("meter_power");
            }
            if (!this.hasCapability('t7e_zg_window_state')) {
                await this.addCapability('t7e_zg_window_state');
            }
            if (this.hasCapability('t7e_zg_datetime')) {
                await this.removeCapability('t7e_zg_datetime')
            }

            if (!this.hasCapability('child_lock')) {
                await this.addCapability("child_lock");
            }

            if (!this.hasCapability('t11_zg_fault')) {
                await this.addCapability("t11_zg_fault");
            }


            // heat mode
            if (reg_mode === 'p') {

                //remove target_temperature_top
                if (this.hasCapability('target_temperature')) {
                    await this.removeCapability('target_temperature')
                }

                if (this.hasCapability('measure_temperature')) {
                    await this.removeCapability('measure_temperature')
                }

                if (this.hasCapability('eco_mode')) {
                    await this.removeCapability('eco_mode')
                }

                if (this.hasCapability('frost')) {
                    await this.removeCapability('frost')
                }

                //add
                if (!this.hasCapability('t11_zg_regulator_percentage')) {
                    await this.addCapability('t11_zg_regulator_percentage');
                }

                this.setSettings({
                    sensor_mode: 'p',
                    thermostat_regulator_mode: '6',
                });

                let rp = this.getStoreValue('t11_zg_regulator_percentage') || 0.2;
                this.setCapabilityValue('t11_zg_regulator_percentage', rp).catch(this.error);
            } else {

                //remove
                if (this.hasCapability('t11_zg_regulator_percentage')) {
                    await this.removeCapability('t11_zg_regulator_percentage')
                }

                //add

                if (!this.hasCapability('target_temperature')) {
                    await this.addCapability("target_temperature");
                }

                if (!this.hasCapability('measure_temperature')) {
                    await this.addCapability("measure_temperature");
                }

                if (!this.hasCapability('eco_mode')) {
                    await this.addCapability("eco_mode");
                }

                if (!this.hasCapability('frost')) {
                    await this.addCapability("frost");
                }

                this.setSettings({
                    sensor_mode: 'a',
                    thermostat_regulator_mode: '0',
                });

            }

        } catch (err) {
            this.error(err)
        }

        await this.updateSetpointTempLimit();
        await this._initCapabilityAndListener();
    }

    async _initCapabilityAndListener() {
        await this._setUpSystemCapabilities().catch(this.error)

        if (this.getStoreValue('temperature_display_mode') == 0) {
            await this._setUpTargetTemperatureCapability()
        } else {
            await this._setUpTargetTemperatureFCapability()
        }

        appkit.regulator_percentage.init(this)
        appkit.window_status.init(this)
        appkit.eco_mode.init(this)
        appkit.child_lock.init(this)
        appkit.frost.init(this)
        appkit.sensor_mode.init(this)
        appkit.fault.init(this)
        this._getAttributes()
        this.setDatetime()
    }


    showMessage(msg) {
        this.unsetWarning().catch(this.error);
        this.setWarning(msg).catch(this.error);
    }

    //==========================================================================================
    //        Report handler
    async _onHandlerReport() {
        this.onoffCluster().on('attr.onOff', async value => {
            this.setCapabilityValue('onoff', value).catch(this.error)
            if (value === true || value === 1) {
                await this._start()
            }
        })

        this.thermostatCluster().on('attr.frost', async value => {
            if (this.hasCapability('frost')) {
                this.driver.triggerMyFlow(this, value || false);
            }
        })

        this.thermostatUserInterfaceConfiguration().on('attr.temperatureDisplayMode', async value => {
            await this._start()
        })

        this.thermostatCluster().on('attr.occupiedHeatingSetpoint', value => {
            let temp = parseFloat((getInt16(value) / 100).toFixed(1))
            if (this.hasCapability('target_temperature')) {
                if (temp >= this.target_temp_setpoint_min && temp <= this.target_temp_setpoint_max) {
                    this.setCapabilityValue('target_temperature', temp).catch(this.error)
                }
            }
        })

        this.thermostatCluster().on('attr.occupiedCoolingSetpoint', value => {
            let temp = parseFloat((getInt16(value) / 100).toFixed(1))
            if (this.hasCapability('target_temperature')) {
                if (temp >= this.target_temp_setpoint_min && temp <= this.target_temp_setpoint_max) {
                    this.setCapabilityValue('target_temperature', temp).catch(this.error)
                }
            }
        })

        this.thermostatCluster().on('attr.occupiedHeatingSetpointF', value => {
            let temp = parseFloat((getInt16(value) / 100).toFixed(1))
            if (this.hasCapability('target_temperature')) {
                if (temp >= this.target_temp_setpoint_min && temp <= this.target_temp_setpoint_max) {
                    this.setCapabilityValue('target_temperature', temp).catch(this.error)
                }
            }
        })

        this.thermostatCluster().on('attr.occupiedCoolingSetpointF', value => {
            let temp = parseFloat((getInt16(value) / 100).toFixed(1))
            if (this.hasCapability('target_temperature')) {
                if (temp >= this.target_temp_setpoint_min && temp <= this.target_temp_setpoint_max) {
                    this.setCapabilityValue('target_temperature', temp).catch(this.error)
                }
            }
        })

        //target temp limit report
        this.thermostatCluster().on('attr.absMinHeatSetpointLimit', value => {
            this.target_temp_setpoint_min = parseFloat((getInt16(value) / 100).toFixed(1))
            this.updateSetpointTempLimit()
        })

        this.thermostatCluster().on('attr.absMaxHeatSetpointLimit', value => {
            this.target_temp_setpoint_max = parseFloat((getInt16(value) / 100).toFixed(1))
            this.updateSetpointTempLimit()
        })

        this.thermostatCluster().on('attr.absMinCoolSetpointLimit', value => {
            this.target_temp_setpoint_min = parseFloat((getInt16(value) / 100).toFixed(1))
            this.updateSetpointTempLimit()
        })

        this.thermostatCluster().on('attr.absMaxCoolSetpointLimit', value => {
            this.target_temp_setpoint_max = parseFloat((getInt16(value) / 100).toFixed(1))
            this.updateSetpointTempLimit()
        })

        this.thermostatCluster().on('attr.absMinHeatSetpointLimitF', value => {
            this.target_temp_setpoint_min = parseFloat((getInt16(value) / 100).toFixed(1))
            this.updateSetpointTempLimit()
        })

        this.thermostatCluster().on('attr.absMaxHeatSetpointLimitF', value => {
            this.target_temp_setpoint_max = parseFloat((getInt16(value) / 100).toFixed(1))
            this.updateSetpointTempLimit()
        })

        this.thermostatCluster().on('attr.absMinCoolSetpointLimitF', value => {
            this.target_temp_setpoint_min = parseFloat((getInt16(value) / 100).toFixed(1))
            this.updateSetpointTempLimit()
        })

        this.thermostatCluster().on('attr.absMaxCoolSetpointLimitF', value => {
            this.target_temp_setpoint_max = parseFloat((getInt16(value) / 100).toFixed(1))
            this.updateSetpointTempLimit()
        })

        this.thermostatCluster().on('attr.systemMode', value => {
            this._setModeUI(value)
            this.updateSetpointTempLimit()
        })

        this.thermostatCluster().on('attr.syncTimeReq', value => {
            if (value === true || value === 1) {
                this.setDatetime()
            }
        })

        this.thermostatCluster().on('attr.fault', async value => {
            let thefault = '0'
            const res = value.getBits();
            if (res.length > 0) {
                thefault = res[res.length - 1];
                if (thefault === undefined) {
                    thefault = '0'
                }
            }
            this.setCapabilityValue('t11_zg_fault', thefault).catch(this.error)
        })

        this.thermostatCluster().on('attr.windowCheck', async value => {
            await this.setSettings({window_check: value})
        })

        this.thermostatCluster().on('attr.sensorMode', value => {
            this.log('++++++++++++++++sensorMode', value)
            this.setSettings({sensor_mode: value})
            this._checkModeStatus(value)
            this.showMessage('The regulator mode has changed. Please return and trigger the switch to reboot the device.');
        })

        this.thermostatCluster().on('attr.backlight', value => {
            this.setSettings({lcd_backlight_wait: value}).catch(this.error)
        })

        this.thermostatCluster().on('attr.holiday_temp_set', value => {
            this.setSettings({holiday_temp_set: value / 100}).catch(this.error)
        })

        this.thermostatCluster().on('attr.holiday_temp_set_f', value => {
            this.setSettings({holiday_temp_set_f: value / 100}).catch(this.error)
        })

        this.thermostatCluster().on('attr.vacation_mode', value => {
            this.log('+++++++++++vacation_mode:', value)
            this.setSettings({vacation_mode: (value).toString()}).catch(this.error)
        })

        this.thermostatCluster().on('attr.auto_time', value => {
            this.log('+++++++++++auto_time:', value)
            this.setSettings({auto_time: (value).toString()}).catch(this.error)
        })

        this.thermostatCluster().on('attr.countdown_left', value => {
            this.setSettings({countdown_left: value.toString() + ' min'}).catch(this.error)
        })

        this.thermostatCluster().on('attr.countdown_set', value => {
            this.setSettings({countdown_set: value}).catch(this.error)
        })

        this.thermostatCluster().on('attr.vacation_start_date', value => {
            this.setSettings({vacation_start_date: moment(value * 86400000).format('YYYY-MM-DD')}).catch(this.error)
        })

        this.thermostatCluster().on('attr.vacation_end_date', value => {
            this.setSettings({vacation_end_date: moment(value * 86400000).format('YYYY-MM-DD')}).catch(this.error)
        })

    }

    setDatetime() {
        let offset = moment.tz.zone(this.homey.clock.getTimezone()).utcOffset(Date.now())
        let date = (Date.now() / 1000) + (-offset * 60)
        this.thermostatCluster().writeAttributes({
            syncTime: date,
        }).then((res) => {

        }).catch(err => {

        })
    }

    //==========================================================================================
    //  Instances

    thermostatCluster() {
        return this.zclNode.endpoints[1].clusters.thermostat
    }

    onoffCluster() {
        return this.zclNode.endpoints[1].clusters.onOff
    }

    //child lock
    thermostatUserInterfaceConfiguration() {
        return this.zclNode.endpoints[1].clusters.thermostatUserInterfaceConfiguration
    }

    //================================================================================================================
    //    setup

    //set onoff, power, kwh
    async _setUpSystemCapabilities() {
        this.registerCapability('onoff', CLUSTER.ON_OFF)
        this.registerCapabilityListener('onoff', async isOn => {
            //send command
            if (isOn) {
                await this.onoffCluster().setOn().catch((err) => {
                    this.setCapabilityValue('onoff', !isOn).catch(this.error)
                })
            } else {
                await this.onoffCluster().setOff().catch((err) => {
                    this.setCapabilityValue('onoff', !isOn).catch(this.error)
                })
            }

            //Power off, then set measure_power to 0
            if (isOn === false) {
                if (this.hasCapability('measure_power')) {
                    this.setCapabilityValue('measure_power', 0.0).catch(this.error)
                }
                if (this.hasCapability('meter_power')) {
                    this.setCapabilityValue('meter_power', 0.0).catch(this.error)
                }
            }
        })

        // meter_power
        if (this.hasCapability('meter_power')) {

            try {
                const {
                    multiplier, divisor
                } = await this.zclNode.endpoints[this.getClusterEndpoint(
                    CLUSTER.METERING)].clusters[CLUSTER.METERING.NAME].readAttributes(
                    ['multiplier', 'divisor']).catch(this.error)

                if (multiplier && divisor) {
                    this.meter_multiplier = multiplier / divisor;
                }
            } catch (error) {
            }

            this.registerCapability('meter_power', CLUSTER.METERING, {
                get: 'currentSummationDelivered',
                report: 'currentSummationDelivered',
                reportParser: value => {

                    return value * this.meter_multiplier
                },
                getOpts: {
                    getOnStart: true, pollInterval: getOptBaseTime,
                },
                reportOpts: {
                    configureAttributeReporting: {
                        minInterval: 10,
                        maxInterval: 60000,
                        minChange: 0.001,
                    },
                },
            })
        }

        // measure_power
        if (this.hasCapability('measure_power')) {
            this.registerCapability('measure_power', CLUSTER.ELECTRICAL_MEASUREMENT, {
                get: 'activePower', report: 'activePower', reportParser: value => {
                    return value * this.power_multiplier
                }, getOpts: {
                    getOnStart: true, pollInterval: getOptBaseTime,
                }, reportOpts: {
                    configureAttributeReporting: {
                        minInterval: 10,
                        maxInterval: 60000,
                        minChange: 0.1,
                    },
                },
            })
        }
    }

    //Current temp
    async _setUpMeasureTemperatureCapability() {
        if (!this.hasCapability('measure_temperature')) return
        this.thermostatCluster().on('attr.localTemperature', async value => {
            let temp = parseFloat((getInt16(value) / 100).toFixed(1))
            if (this.hasCapability('measure_temperature')) {
                this.setCapabilityValue('measure_temperature', temp).catch(this.error)
            }
        })
    }

    async _setUpMeasureTemperatureFCapability() {
        if (!this.hasCapability('measure_temperature')) return
        this.thermostatCluster().on('attr.localTemperatureF', async value => {
            let temp = parseFloat((getInt16(value) / 100).toFixed(1))
            if (this.hasCapability('measure_temperature')) {
                this.setCapabilityValue('measure_temperature', temp).catch(this.error)
            }
        })
    }

    async _setUpTargetTemperatureCapability() {
        if (!this.hasCapability('target_temperature')) return
        this.registerCapabilityListener('target_temperature', async value => {
            let payload = {}
            let curMode = this.getStoreValue('last_system_mode') || 'heat'
            if (curMode === 'heat') {
                payload['occupiedHeatingSetpoint'] = value * 100
            } else if (curMode === 'cool') {
                payload['occupiedCoolingSetpoint'] = value * 100
            }
            this.thermostatCluster().writeAttributes(payload).then(() => {
                this.updateSetpointTempLimit()
            }).catch(this.error)

        })
    }

    async _setUpTargetTemperatureFCapability() {
        if (!this.hasCapability('target_temperature')) return
        this.registerCapabilityListener('target_temperature', async value => {
            let payload = {}
            let curMode = this.getStoreValue('last_system_mode') || 'heat'
            if (curMode === 'heat') {
                payload['occupiedHeatingSetpointF'] = value * 100
            } else if (curMode === 'cool') {
                payload['occupiedCoolingSetpointF'] = value * 100
            }
            this.thermostatCluster().writeAttributes(payload).then(() => {
                this.updateSetpointTempLimit()
            }).catch(this.error)

        })
    }

    //================================================================================================================
    //  others

    async onSettings({oldSettings, newSettings, changedKeys}) {
        await this._setDeviceSettings(newSettings, changedKeys);
    }

    async _setDeviceSettings(newSettings, changedKeys) {
        changedKeys.forEach(element => {
            let o = appkit[element];
            if (o != undefined) {
                if (o['setConfig']) {
                    o.setConfig(this, newSettings[element]);
                }
            }
        })
    }

    //init get device attributes.
    async _getAttributes() {
        if (this.thermostatUserInterfaceConfiguration() === null || this.thermostatUserInterfaceConfiguration() === undefined) {
            return
        }
        //child lock
        await this.thermostatUserInterfaceConfiguration().readAttributes(['keypadLockout']).then(value => {
            if (value.hasOwnProperty('keypadLockout')) {
                let isOpen = value['keypadLockout'] === 'level1Lockout'
                this.setCapabilityValue('child_lock', isOpen).catch(this.error)
            }
        }).catch(this.error)

        if (this.getStoreValue('temperature_display_mode') == 0) {

            // target_temperature
            if (this.hasCapability('target_temperature')) {
                await this.thermostatCluster().readAttributes(['occupiedHeatingSetpoint', 'occupiedCoolingSetpoint']).then(value => {

                    this.log('occupiedHeatingSetpoint---------0000000:', value)
                    let curMode = this.getStoreValue('last_system_mode') || 'heat'
                    if (curMode === 'heat') {
                        const temp = parseFloat(
                            (value['occupiedHeatingSetpoint'] / 100).toFixed(1))
                        if (this.hasCapability('target_temperature')) {
                            if (temp >= this.target_temp_setpoint_min && temp <= this.target_temp_setpoint_max) {
                                this.setCapabilityValue('target_temperature', temp).catch(this.error)
                            }
                        }

                    } else if (curMode === 'cool') {
                        const temp = parseFloat(
                            (value['occupiedCoolingSetpoint'] / 100).toFixed(1))
                        if (this.hasCapability('target_temperature')) {
                            if (temp >= this.target_temp_setpoint_min && temp <= this.target_temp_setpoint_max) {
                                this.setCapabilityValue('target_temperature', temp).catch(this.error)
                            }
                        }
                    }

                }).catch(this.error)
            }

            //measure_temperature
            if (this.hasCapability('measure_temperature')) {
                try {
                    await this.thermostatCluster().readAttributes(['localTemperature']).then(value => {

                        const temp = parseFloat(
                            (value['localTemperature'] / 100).toFixed(1))

                        if (temp > -20) {
                            if (this.hasCapability('measure_temperature')) {
                                this.setCapabilityValue('measure_temperature', temp).catch(this.error)
                            }
                        }

                    }).catch(this.error)
                } catch (error) {
                }
            }
        }

        if (this.getStoreValue('temperature_display_mode') == 1) {
            if (this.hasCapability('target_temperature')) {
                await this.thermostatCluster().readAttributes(['occupiedHeatingSetpointF', 'occupiedCoolingSetpointF']).then(value => {
                    this.log('++__++__++occupiedHeatingSetpointF:', value)
                    let curMode = this.getStoreValue('last_system_mode') || 'heat'
                    if (curMode === 'heat') {
                        const temp = parseFloat((value['occupiedHeatingSetpointF'] / 100).toFixed(1))
                        if (this.hasCapability('target_temperature')) {
                            this.setCapabilityValue('target_temperature', temp).catch(this.error)
                        }

                    } else if (curMode === 'cool') {
                        const temp = parseFloat(
                            (value['occupiedCoolingSetpointF'] / 100).toFixed(1))
                        if (this.hasCapability('target_temperature')) {
                            this.setCapabilityValue('target_temperature', temp).catch(this.error)
                        }
                    }
                }).catch(this.error)
            }

            if (this.hasCapability('measure_temperature')) {
                try {
                    await this.thermostatCluster().readAttributes(['localTemperatureF']).then(value => {
                        const temp = parseFloat((value['localTemperatureF'] / 100).toFixed(1))
                        if (this.hasCapability('measure_temperature')) {
                            this.setCapabilityValue('measure_temperature', temp).catch(this.error)
                        }
                    }).catch(this.error)
                } catch (error) {
                }
            }
        }

        //frost flag
        if (this.hasCapability('frost')) {
            await this.thermostatCluster().readAttributes(['frost']).then(value => {
                if (value.hasOwnProperty('frost')) {
                    this.setCapabilityValue('frost', value['frost']).catch(this.error)
                }

            }).catch(this.error)
        }

        //t11_zg_regulator_percentage
        if (this.hasCapability('t11_zg_regulator_percentage')) {
            await this.thermostatCluster().readAttributes(['regulator_percentage']).then(value => {
                if (value.hasOwnProperty('regulator_percentage')) {
                    this.setCapabilityValue('t11_zg_regulator_percentage', value['regulator_percentage'] / 100).catch(this.error)
                }
            }).catch(this.error)
        }

        //fault
        if (this.hasCapability('t11_zg_fault')) {
            await this.thermostatCluster().readAttributes(["fault"]).then(value => {
                if (value.hasOwnProperty('fault')) {
                    let thefault = '0'
                    const faultValue = value['fault']
                    if (faultValue.length > 0) {
                        const res = faultValue.getBits();
                        thefault = res[res.length - 1];
                        if (thefault === undefined) {
                            thefault = '0'
                        }
                    }
                    this.setCapabilityValue('t11_zg_fault', thefault).catch(this.error)
                }
            }).catch(this.error)
        }

        //others
        await this.thermostatCluster().readAttributes(
            ['windowState',
                'backlight',
                'thermostatProgramOperModel',
                'sensorMode',
                'windowCheck',
                'holiday_temp_set',
                'holiday_temp_set_f',
                'vacation_mode',
                'auto_time',
                'countdown_set',
                'vacation_start_date',
                'vacation_end_date']
        ).then(async value => {

            this.log('******************************', value)

            if (value.hasOwnProperty('windowState')) {
                await this.setCapabilityValue('t7e_zg_window_state', value['windowState'] ? "opened" : "closed").catch(this.error)
            }

            if (value.hasOwnProperty('backlight')) {
                await this.setSettings({lcd_backlight_wait: Number(value['backlight'])}).catch(this.error)
            }

            if (value.hasOwnProperty('holiday_temp_set')) {
                await this.setSettings({holiday_temp_set: (Number(value['holiday_temp_set']) / 100)}).catch(this.error)
            }

            if (value.hasOwnProperty('holiday_temp_set_f')) {
                await this.setSettings({holiday_temp_set_f: (Number(value['holiday_temp_set_f']) / 100)}).catch(this.error)
            }

            if (value.hasOwnProperty('vacation_mode')) {
                await this.setSettings({vacation_mode: (value['vacation_mode']).toString()}).catch(this.error)
            }

            if (value.hasOwnProperty('auto_time')) {
                await this.setSettings({auto_time: (value['auto_time']).toString()}).catch(this.error)
            }

            if (value.hasOwnProperty('vacation_start_date')) {
                await this.setSettings({vacation_start_date: moment(value['vacation_start_date'] * 86400000).format('YYYY-MM-DD')}).catch(this.error)
            }

            if (value.hasOwnProperty('vacation_end_date')) {
                await this.setSettings({vacation_end_date: moment(value['vacation_end_date'] * 86400000).format('YYYY-MM-DD')}).catch(this.error)
            }

            if (value.hasOwnProperty('countdown_set')) {
                await this.setSettings({countdown_set: value['countdown_set']}).catch(this.error)
            }

            if (value.hasOwnProperty('countdown_left')) {
                await this.setSettings({countdown_left: value['countdown_left'].toString() + ' min'}).catch(this.error)
            }

            if (value.hasOwnProperty('thermostatProgramOperModel')) {
                try {
                    const res = value['thermostatProgramOperModel'].getBits();
                    if (this.hasCapability('eco_mode')) {
                        await this.setCapabilityValue('eco_mode', res.includes('eco') ? true : false).catch(this.error)
                    }
                } catch (ex) {
                }
            }

            if (value.hasOwnProperty('windowCheck')) {
                await this.setSettings({window_check: value['windowCheck']}).catch(this.error)
            }

            if (value.hasOwnProperty('sensorMode')) {
                await this.setSettings({sensor_mode: value['sensorMode']}).catch(this.error)
                await this._checkModeStatus(value['sensorMode'])
            }

        }).catch(this.error)


        await this.onoffCluster().readAttributes(['onOff']).then(async value => {
            if (value.hasOwnProperty('onOff')) {
                this.setCapabilityValue('onoff', value.onOff).catch(this.error)
            }
        }).catch(this.error)


        //kwh
        try {
            const {
                multiplier, divisor, currentSummationDelivered
            } = await this.zclNode.endpoints[this.getClusterEndpoint(
                CLUSTER.METERING)].clusters[CLUSTER.METERING.NAME].readAttributes(
                ['multiplier', 'divisor', 'currentSummationDelivered']).catch(this.error)

            if (multiplier && divisor) {
                this.meter_multiplier = multiplier / divisor;
            }

            this.setCapabilityValue('meter_power', this.meter_multiplier * currentSummationDelivered).catch(this.error)

        } catch (error) {
        }

        //power
        try {
            const {
                acPowerMultiplier, acPowerDivisor, activePower
            } = await this.zclNode.endpoints[this.getClusterEndpoint(
                CLUSTER.ELECTRICAL_MEASUREMENT)].clusters[CLUSTER.ELECTRICAL_MEASUREMENT.NAME].readAttributes(
                ['acPowerMultiplier', 'acPowerDivisor', 'activePower']).catch(this.error)

            if (acPowerMultiplier && acPowerDivisor) {
                this.power_multiplier = acPowerMultiplier / acPowerDivisor;
            }

            this.setCapabilityValue('measure_power', this.power_multiplier * activePower).catch(this.error)

        } catch (error) {
        }
    }

    _setModeUI(mode) {
        if (mode === 'heat' || mode === 'cool') {
            this.setSettings({systemMode: mode}).catch(this.error)
            this.setStoreValue('last_system_mode', mode).catch(this.error);
        }
    }

    async _checkModeStatus(value) {
        //模式改变(A,F.... <-> P)
        let m = this.getStoreValue('sensor_mode') || 'a'
        if ((m === 'p') && value !== 'p') {
            this.setSettings({
                thermostat_regulator_mode: '0',
            }).catch(this.error);
        } else if ((m !== 'p') && (value === 'p')) {
            this.setSettings({
                thermostat_regulator_mode: '6',
            }).catch(this.error);
        }
    }

    error(msg, err) {
        this.log('---xxx', msg, err)
        let errMsg = msg + "-" + err

        if (errMsg.includes('node_object_not_found')) {
            this.setUnavailable('Perhaps device is left network').catch(this.error)
        }
        if (errMsg.includes('Device is not responding')) {
            this.setUnavailable('Device is not responding, make sure the device has power.').catch(this.error)
        }
        if (errMsg.includes('Missing Zigbee Node')) {
            this.setUnavailable('Perhaps device is left network').catch(this.error)
        }
        if (errMsg.includes('Could not reach device')) {
            this.setUnavailable('Could not reach device. Is it powered on?').catch(this.error)
        }
    }

    async updateSetpointTempLimit() {
        if (!this.hasCapability('target_temperature')) return

        let curMode = this.getStoreValue('last_system_mode') || 'heat'

        if (curMode === 'heat') {
            if (this.getStoreValue('temperature_display_mode') == 0) {
                this.target_temp_setpoint_min = this.absMinHeatSetpointLimit
                this.target_temp_setpoint_max = this.absMaxHeatSetpointLimit
            } else {
                this.target_temp_setpoint_min = this.absMinHeatSetpointLimitF
                this.target_temp_setpoint_max = this.absMaxHeatSetpointLimitF
            }
        }

        if (curMode === 'cool') {
            if (this.getStoreValue('temperature_display_mode') == 0) {
                this.target_temp_setpoint_min = this.absMinCoolSetpointLimit
                this.target_temp_setpoint_max = this.absMaxCoolSetpointLimit
            } else {
                this.target_temp_setpoint_min = this.absMinCoolSetpointLimitF
                this.target_temp_setpoint_max = this.absMaxCoolSetpointLimitF
            }

        }
        let target_temp = this.getCapabilityValue('target_temperature')

        let min = this.target_temp_setpoint_min
        let max = this.target_temp_setpoint_max
        let step = 0.5

        let capOptions = {
            "min": 5,
            "max": 40,
            "step": 0.5,
        }

        this.log('--温度选项: old: ', capOptions);
        if ((min !== undefined ? min : capOptions.min) >= (max !== undefined ? max : capOptions.max)) {
            return
        }

        try {
            if (min || max || step) {
                capOptions.min = min
                capOptions.max = max
                capOptions.step = step
                capOptions.decimals = step >= 0.5 ? 1 : 2

                await this.setCapabilityOptions('target_temperature', capOptions).then(result => {
                    this.log('---set target_temperature min-max: OK ', capOptions)

                    //温度范围内控制更新
                    if (target_temp > max) {
                        this.setCapabilityValue('target_temperature', max).catch(this.error)
                    }

                }).catch(error => {
                    this.log('---set target_temperature min-max: ', error)
                })
            }
        } catch (err) {
            this.log('updateSetpointTempLimit ERROR', err);
        }
    }

    async turnFrostRunListener(args, state) {
        await this.thermostatCluster()
        .writeAttributes({frost: args.frost})
        .then(() => {
            this.setCapabilityValue('frost', args.frost).catch(this.error);
        })
        .catch(this.error)
    }
}

module.exports = t11_zg_thermostat_device;
