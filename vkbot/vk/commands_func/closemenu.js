module.exports = {
    func: async (ctx) => {
        // В VK inline-клавиатуры убираются только заменой сообщения
        // Просто ответим пустым снекбаром
        if (ctx.answerEvent) {
            await ctx.answerEvent("Закрыто")
        }
    },
}
