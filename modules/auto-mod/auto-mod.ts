import { Message, GuildMember, User, Guild } from 'discord.js';
import { GuildDocument, MessageFilter } from '../../models/guild';
import { BadWordValidator } from './validators/bad-word.validator';
import { BadLinkValidator } from './validators/bad-link.validator';
import Deps from '../../utils/deps';
import Members from '../../data/members';
import { EmojiValidator } from './validators/emoji.validator';
import { MassMentionValidator } from './validators/mass-mention.validator';
import { MassCapsValidator } from './validators/mass-caps.validator';
import { ZalgoValidator } from './validators/zalgo.validator';
import { emitter } from '../../bot';
import { ContentValidator } from './validators/content-validator';

export default class AutoMod {
    constructor(private members = Deps.get<Members>(Members)) {}

    readonly validators: ContentValidator[] = [
        new BadWordValidator(),
        new BadLinkValidator(),
        new EmojiValidator(),
        new MassMentionValidator(),
        new MassCapsValidator(),
        new ZalgoValidator()
    ];
    
    async validateMsg(msg: Message, guild: GuildDocument) {
        const activeFilters = guild.autoMod.filters;
        for (const filter of activeFilters) {
            try {                
                const validator = this.validators.find(v => v.filter === filter);
                validator?.validate(msg.content, guild);
            } catch (validation) {
                if (guild.autoMod.autoDeleteMessages)
                    await msg.delete({ reason: validation.message });
                if (guild.autoMod.autoWarnUsers && msg.member && msg.client.user)
                    await this.warnMember(msg.member, msg.client.user, validation.message);

                throw validation;
            }
        }
    }

    async warnMember(member: GuildMember, instigator: User, reason = 'No reason specified.') {
        if (member.id === instigator.id)
            throw new TypeError('You cannot warn yourself.');
        if (member.user.bot)
            throw new TypeError('Bots cannot be warned.');

        const savedMember = await this.members.get(member);
        const warning = { reason, instigatorId: instigator.id, at: new Date() };

        savedMember.warnings.push(warning);        
        await this.members.save(savedMember);

        emitter.emit('userWarn', {
            guild: member.guild,
            instigator,
            user: member.user,
            reason,
            warnings: savedMember.warnings.length
        } as UserPunishmentArgs);

        try {
            await member.send(`<@!${instigator}> warned you for \`${reason}\``);
        } catch {}
    }

    // muteMember(target: GuildMember, user: User, reason: string) {        
    //     target.permissions.remove(['SEND_MESSAGES']);
    // }
}

export interface UserPunishmentArgs {
    guild: Guild;
    user: User;
    instigator: User;
    warnings: number;
    reason: string;
}

export class ValidationError extends Error {
    constructor(message: string, public filter: MessageFilter) {
        super(message);
    }
}
